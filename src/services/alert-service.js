import { EMERGENCY_ALERT_INTERVAL_MS, EMERGENCY_ALERT_REPETITIONS } from "../config/default-config.js";
import { pickMessage } from "../messages/personality.js";
import { formatDateTime } from "../utils/time.js";

function listFruitNames(fruits) {
  return fruits.map((fruit) => fruit.name).join(", ");
}

function formatDealerBlock(title, dealer, locale, timeZone) {
  return [
    title,
    `Frutas: ${dealer.fruits.length ? listFruitNames(dealer.fruits) : "Nenhuma fruta detectada"}`,
    `Proxima troca: ${formatDateTime(dealer.nextRotationAt, locale, timeZone)}`
  ].join("\n");
}

export class AlertService {
  constructor({ database, stockService, logger, config }) {
    this.database = database;
    this.stockService = stockService;
    this.logger = logger;
    this.config = config;
    this.socket = null;
    this.emergencyTimers = new Map();
    this.groupMetadataProvider = null;
  }

  attachSocket(socket, getGroupMetadata) {
    this.socket = socket;
    this.groupMetadataProvider = getGroupMetadata;
  }

  async notifyStockChange(result) {
    if (!this.socket) {
      return;
    }

    if (result.isInitialSync) {
      return;
    }

    const snapshot = this.stockService.getSnapshot();

    if (!snapshot) {
      return;
    }

    if (result.changed.normal || result.changed.mirage) {
      await this.broadcastStandardStock(result.changedDealers, result.changed);
    }

    await this.triggerEmergencyAlerts(result.changedDealers);
  }

  async broadcastStandardStock(changedDealers, changed) {
    const detailedGroups = this.database.listAlertGroups("stockAlertEnabled");
    const notifyGroups = this.database.listAlertGroups("stockNotifyEnabled");
    const targets = new Map();

    for (const group of [...detailedGroups, ...notifyGroups]) {
      targets.set(group.id, group);
    }

    const changedBlocks = [];

    if (changed.normal && changedDealers.normal) {
      changedBlocks.push(formatDealerBlock(
        "🏪 Dealer Normal",
        changedDealers.normal,
        this.config.language,
        this.config.timezone
      ));
    }

    if (changed.mirage && changedDealers.mirage) {
      changedBlocks.push(formatDealerBlock(
        "🌌 Dealer Mirage",
        changedDealers.mirage,
        this.config.language,
        this.config.timezone
      ));
    }

    for (const group of targets.values()) {
      const isDetailed = group.stockAlertEnabled;
      const changeTags = [
        changed.normal ? "normal" : null,
        changed.mirage ? "mirage" : null
      ].filter(Boolean).join(", ");
      const lines = [pickMessage("stockFound")];

      if (isDetailed) {
        lines.push(
          `Dealers alterados: ${changeTags || "desconhecido"}`,
          "",
          ...changedBlocks.flatMap((block, index) => index === 0 ? [block] : ["", block])
        );
      } else {
        if (changed.normal && changedDealers.normal) {
          lines.push(`Normal: ${listFruitNames(changedDealers.normal.fruits)}`);
        }

        if (changed.mirage && changedDealers.mirage) {
          lines.push(`Mirage: ${listFruitNames(changedDealers.mirage.fruits)}`);
        }
      }

      try {
        await this.socket.sendMessage(group.id, {
          text: lines.join("\n")
        });
      } catch (error) {
        this.logger.error("alerts", `Falha ao enviar alerta para ${group.id}.`, error);
      }
    }
  }

  async triggerEmergencyAlerts(changedDealers) {
    const emergencyGroups = this.database.listAlertGroups("emergencyEnabled");
    const emergencySet = new Set(this.database.getRuntimeConfig().emergencyFruits);
    const dealerHits = [];

    if (changedDealers.normal) {
      dealerHits.push(...changedDealers.normal.fruits.map((fruit) => ({
        ...fruit,
        dealerType: "normal"
      })));
    }

    if (changedDealers.mirage) {
      dealerHits.push(...changedDealers.mirage.fruits.map((fruit) => ({
        ...fruit,
        dealerType: "mirage"
      })));
    }

    const emergencyHits = dealerHits.filter((fruit) => emergencySet.has(fruit.key));

    if (!emergencyHits.length) {
      return;
    }

    for (const group of emergencyGroups) {
      if (this.emergencyTimers.has(group.id)) {
        continue;
      }

      await this.scheduleEmergencySequence(group.id, emergencyHits);
    }
  }

  async scheduleEmergencySequence(groupId, fruits) {
    const mentions = await this.collectMentions(groupId);
    const fruitNames = fruits
      .map((fruit) => `${fruit.name} (${fruit.dealerType})`)
      .join(", ");
    const state = {
      cancelled: false,
      timeouts: []
    };

    this.emergencyTimers.set(groupId, state);

    for (let index = 0; index < EMERGENCY_ALERT_REPETITIONS; index += 1) {
      const timeout = setTimeout(async () => {
        if (state.cancelled || !this.socket) {
          return;
        }

        try {
          await this.socket.sendMessage(groupId, {
            text: [
              "🚨 ALERTA DE EMERGENCIA",
              `Frutas raras detectadas: ${fruitNames}`,
              "Respondam no grupo para cancelar a sequencia automatica."
            ].join("\n"),
            mentions
          });
        } catch (error) {
          this.logger.error("alerts", `Falha ao enviar alerta de emergencia para ${groupId}.`, error);
        }

        if (index === EMERGENCY_ALERT_REPETITIONS - 1) {
          this.emergencyTimers.delete(groupId);
        }
      }, index * EMERGENCY_ALERT_INTERVAL_MS);

      state.timeouts.push(timeout);
    }
  }

  async collectMentions(groupId) {
    try {
      const metadata = await this.groupMetadataProvider?.(groupId);
      return metadata?.participants?.map((participant) => participant.id) || [];
    } catch (error) {
      this.logger.error("alerts", `Falha ao carregar membros de ${groupId}.`, error);
      return [];
    }
  }

  cancelEmergencyForGroup(groupId) {
    const state = this.emergencyTimers.get(groupId);

    if (!state) {
      return;
    }

    state.cancelled = true;

    for (const timeout of state.timeouts) {
      clearTimeout(timeout);
    }

    this.emergencyTimers.delete(groupId);
    this.logger.info("alerts", `Sequencia de emergencia cancelada para ${groupId}.`);
  }
}
