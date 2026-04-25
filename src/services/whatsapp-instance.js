import qrcode from "qrcode-terminal";
import { Boom } from "@hapi/boom";
import NodeCache from "node-cache";
import { makeWASocket, makeCacheableSignalKeyStore, DisconnectReason } from "baileys";
import P from "pino";
import { RECONNECT_DELAY_MS } from "../config/constants.js";
import { logger } from "../lib/logger.js";
import { useMongoAuthState } from "./mongo-auth-state.js";
import { NexusRuntime } from "./nexus-runtime.js";

const BAILEYS_LOGGER = P({ level: "silent" });
const WHATSAPP_VERSION = [2, 3000, 1035194821];
const PAIRING_REQUEST_DELAY_MS = 3_000;

function normalizePhoneNumber(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export class WhatsAppInstance {
  constructor({ instanceId, store, loginMethod, phoneNumber }) {
    this.instanceId = instanceId;
    this.store = store;
    this.loginMethod = loginMethod || "qr";
    this.phoneNumber = normalizePhoneNumber(phoneNumber);
    this.isRegistered = false;
    this.socket = null;
    this.started = false;
    this.pairingCodeRequested = false;
    this.reconnectTimeout = null;
    this.awaitingPairing = false;
    this.connectGeneration = 0;
    this.msgRetryCounterCache = new NodeCache({ useClones: false });
    this.signalKeyStoreCache = new NodeCache({ useClones: false });
    this.runtime = new NexusRuntime(instanceId);
  }

  async start() {
    if (this.started) {
      logger.warn(this.instanceId, "Instancia ja esta em execucao.");
      return;
    }

    this.started = true;
    await this.setStatus("starting");
    await this.connect();
  }

  async connect() {
    try {
      const generation = ++this.connectGeneration;
      const { state, saveCreds } = await useMongoAuthState(this.instanceId);
      this.isRegistered = Boolean(state.creds.registered);

      this.socket = makeWASocket({
        version: WHATSAPP_VERSION,
        emitOwnEvents: true,
        fireInitQueries: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: true,
        markOnlineOnConnect: true,
        connectTimeoutMs: 120_000,
        retryRequestDelayMs: 5_000,
        qrTimeout: 180_000,
        keepAliveIntervalMs: 30_000,
        defaultQueryTimeoutMs: undefined,
        msgRetryCounterCache: this.msgRetryCounterCache,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            BAILEYS_LOGGER,
            this.signalKeyStoreCache
          )
        },
        printQRInTerminal: false,
        logger: BAILEYS_LOGGER
      });

      this.socket.ev.on("creds.update", async () => {
        this.isRegistered = Boolean(state.creds.registered);
        await saveCreds();
      });
      await this.runtime.attachSocket(this.socket);
      this.socket.ev.on("connection.update", (update) => {
        this.handleConnectionUpdate(update).catch((error) => {
          logger.error(this.instanceId, "Falha ao processar evento de conexao.", error);
        });
      });

      logger.info(this.instanceId, "Conexao iniciada.");
      await this.setStatus(state.creds.registered ? "connecting" : "authenticating");

      if (this.loginMethod === "pairing" && !state.creds.registered) {
        logger.info(this.instanceId, "Aguardando o socket inicializar antes de solicitar o pairing code...");
        await this.wait(PAIRING_REQUEST_DELAY_MS);
        await this.requestPairingCode(generation);
      }
    } catch (error) {
      this.started = false;
      await this.setStatus("error");
      logger.error(this.instanceId, "Erro ao iniciar conexao.", error);
    }
  }

  async setStatus(status) {
    try {
      await this.store.updateInstance(this.instanceId, {
        loginMethod: this.loginMethod,
        phoneNumber: this.phoneNumber || null,
        status
      });
    } catch (error) {
      logger.error(this.instanceId, "Falha ao atualizar status da instancia.", error);
    }
  }

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async requestPairingCode(generation = this.connectGeneration) {
    if (!this.socket || this.pairingCodeRequested) {
      return;
    }

    if (generation !== this.connectGeneration) {
      return;
    }

    if (!this.phoneNumber) {
      logger.warn(this.instanceId, "Numero nao informado para gerar pairing code.");
      return;
    }

    this.pairingCodeRequested = true;
    this.awaitingPairing = true;
    await this.setStatus("awaiting_pairing");
    try {
      const code = await this.socket.requestPairingCode(this.phoneNumber);

      if (generation !== this.connectGeneration) {
        return;
      }

      logger.info(
        this.instanceId,
        `Codigo de pareamento: ${code.match(/.{1,4}/g)?.join("-") || code}`
      );
      logger.info(
        this.instanceId,
        "Abra o WhatsApp no celular e digite esse codigo em Dispositivos conectados > Conectar com numero."
      );
    } catch (error) {
      this.pairingCodeRequested = false;

      const statusCode = new Boom(error)?.output?.statusCode || error?.output?.statusCode;
      const isConnectionClosed =
        statusCode === 428 || error?.message?.includes("Connection Closed");

      if (isConnectionClosed) {
        logger.warn(
          this.instanceId,
          "Socket fechou durante o pareamento. A instancia vai permanecer aguardando o codigo ser usado, sem entrar em loop."
        );
        return;
      }

      throw error;
    }
  }

  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr && this.loginMethod === "qr" && !this.isRegistered) {
      logger.info(this.instanceId, "QR Code gerado. Escaneie com o WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      this.pairingCodeRequested = false;
      this.isRegistered = true;
      this.awaitingPairing = false;
      await this.setStatus("connected");
      logger.info(this.instanceId, "Conectado com sucesso.");
      await this.runtime.start();
      return;
    }

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode
        || lastDisconnect?.error?.output?.statusCode;
      const awaitingPairing =
        this.loginMethod === "pairing" && (!this.isRegistered || this.awaitingPairing);
      const waitingForPairingCodeUse = awaitingPairing && statusCode === 428;
      const shouldReconnect =
        !waitingForPairingCodeUse
        && statusCode !== DisconnectReason.loggedOut
        && statusCode !== DisconnectReason.connectionReplaced;

      this.pairingCodeRequested = false;

      logger.warn(
        this.instanceId,
        `Conexao encerrada.${
          waitingForPairingCodeUse
            ? " A instancia continua aguardando voce informar o pairing code no WhatsApp."
            : shouldReconnect
              ? " Tentando reconectar..."
              : " Sessao desconectada."
        }`
      );

      if (waitingForPairingCodeUse) {
        this.started = false;
        await this.setStatus("awaiting_pairing");
        return;
      }

      if (shouldReconnect) {
        await this.setStatus("reconnecting");
        this.scheduleReconnect();
      } else {
        this.started = false;
        this.awaitingPairing = false;
        await this.setStatus(
          statusCode === DisconnectReason.connectionReplaced ? "replaced" : "disconnected"
        );
      }
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect().catch((error) => {
        logger.error(this.instanceId, "Falha na tentativa de reconexao.", error);
      });
    }, RECONNECT_DELAY_MS);
  }

  async stop() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.started = false;
    this.pairingCodeRequested = false;
    this.awaitingPairing = false;
    this.runtime.stop();
    await this.setStatus("stopped");

    if (this.socket) {
      try {
        this.socket.end(new Error("Encerrado pelo usuario"));
      } catch (error) {
        logger.error(this.instanceId, "Erro ao encerrar socket.", error);
      }
    }
  }
}
