import { DEFAULT_CONFIG } from "./default-config.js";
import { mongoConnection } from "../lib/mongo-connection.js";

const APP_CONFIG_COLLECTION = "bot_app_config";
const APP_CONFIG_ID = "app_config";

function normalizeConfig(raw = {}) {
  const merged = {
    ...DEFAULT_CONFIG,
    ...raw
  };

  return {
    botName: String(merged.botName || DEFAULT_CONFIG.botName).trim() || DEFAULT_CONFIG.botName,
    prefix: String(merged.prefix || DEFAULT_CONFIG.prefix).trim().slice(0, 3) || DEFAULT_CONFIG.prefix,
    ownerNumber: String(merged.ownerNumber || DEFAULT_CONFIG.ownerNumber).replace(/\D/g, ""),
    language: String(merged.language || DEFAULT_CONFIG.language).trim() || DEFAULT_CONFIG.language,
    timezone: String(merged.timezone || DEFAULT_CONFIG.timezone).trim() || DEFAULT_CONFIG.timezone,
    autoRead: Boolean(merged.autoRead),
    autoTyping: Boolean(merged.autoTyping),
    stockCheckEnabled: Boolean(merged.stockCheckEnabled)
  };
}

export class AppConfigService {
  static sharedConfig = null;

  constructor(connection = mongoConnection) {
    this.connection = connection;
    this.config = normalizeConfig();
  }

  async init() {
    if (AppConfigService.sharedConfig) {
      this.config = AppConfigService.sharedConfig;
      return this.config;
    }

    const collection = await this.connection.collection(APP_CONFIG_COLLECTION);
    const stored = await collection.findOne({ _id: APP_CONFIG_ID });
    const normalized = normalizeConfig(stored || DEFAULT_CONFIG);

    if (JSON.stringify(stored || {}) !== JSON.stringify(normalized)) {
      await collection.updateOne(
        { _id: APP_CONFIG_ID },
        {
          $set: {
            _id: APP_CONFIG_ID,
            ...normalized,
            updatedAt: new Date().toISOString()
          }
        },
        { upsert: true }
      );
    }

    this.config = normalized;
    AppConfigService.sharedConfig = normalized;
    return this.config;
  }

  get() {
    return this.config;
  }
}
