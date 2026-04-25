import NodeCache from "node-cache";
import { AppConfigService } from "../config/app-config.js";
import { GROUP_METADATA_TTL_SECONDS } from "../config/default-config.js";
import { MongoDatabase } from "../database/mongo-database.js";
import { createAccessControl } from "../middlewares/access-control.js";
import { AlertService } from "./alert-service.js";
import { BloxFruitsService } from "./blox-fruits-service.js";
import { CommandService } from "./command-service.js";
import { FruitResolver } from "./fruit-resolver.js";
import { StockScheduler } from "../schedulers/stock-scheduler.js";
import { createMessageUpsertHandler } from "../events/message-upsert.js";
import { logger } from "../lib/logger.js";

export class NexusRuntime {
  constructor(instanceId) {
    this.instanceId = instanceId;
    this.logger = logger;
    this.configService = new AppConfigService();
    this.database = new MongoDatabase();
    this.resolver = new FruitResolver();
    this.access = createAccessControl();
    this.metadataCache = new NodeCache({ stdTTL: GROUP_METADATA_TTL_SECONDS, useClones: false });
    this.socket = null;
    this.started = false;
    this.initialized = false;
    this.starting = null;
    this.boundMessageHandler = null;
  }

  async init() {
    if (this.initialized) {
      return;
    }

    this.config = await this.configService.init();
    await this.database.init();

    this.stockService = new BloxFruitsService({
      database: this.database,
      resolver: this.resolver,
      logger: this.logger,
      timeZone: this.config.timezone
    });

    this.alertService = new AlertService({
      database: this.database,
      stockService: this.stockService,
      logger: this.logger,
      config: this.config
    });

    this.commandService = new CommandService({
      config: this.config,
      database: this.database,
      stockService: this.stockService,
      alertService: this.alertService,
      access: this.access,
      logger: this.logger
    });

    this.scheduler = new StockScheduler({
      config: this.config,
      stockService: this.stockService,
      alertService: this.alertService,
      logger: this.logger
    });

    this.initialized = true;
  }

  async attachSocket(socket) {
    await this.init();
    this.socket = socket;
    this.alertService.attachSocket(socket, (groupId) => this.getGroupMetadata(groupId));

    if (this.boundMessageHandler) {
      socket.ev.off?.("messages.upsert", this.boundMessageHandler);
    }

    this.boundMessageHandler = createMessageUpsertHandler(this);
    socket.ev.on("messages.upsert", this.boundMessageHandler);
  }

  async start() {
    if (this.started) {
      return;
    }

    if (this.starting) {
      await this.starting;
      return;
    }

    this.starting = this.init();
    await this.starting;
    this.started = true;
    this.starting = null;

    this.scheduler.start().catch((error) => {
      this.logger.error("runtime", `Falha ao iniciar scheduler da instancia ${this.instanceId}.`, error);
    });
  }

  async getGroupMetadata(groupId) {
    const cached = this.metadataCache.get(groupId);

    if (cached) {
      return cached;
    }

    const metadata = await this.socket.groupMetadata(groupId);
    this.metadataCache.set(groupId, metadata);
    return metadata;
  }

  stop() {
    this.scheduler?.stop();
  }
}
