export const DEFAULT_CONFIG = {
  botName: "Nexus Nex",
  prefix: "/",
  ownerNumber: "559999999999",
  language: "pt-BR",
  timezone: "America/Bahia",
  autoRead: true,
  autoTyping: true,
  stockCheckEnabled: true
};

export const DATABASE_DEFAULTS = {
  groups: {
    version: 1,
    updatedAt: null,
    items: {}
  },
  users: {
    version: 1,
    updatedAt: null,
    items: {}
  },
  history: {
    version: 1,
    updatedAt: null,
    items: []
  },
  config: {
    version: 1,
    updatedAt: null,
    emergencyFruits: ["dragon", "kitsune", "yeti", "control"],
    scheduler: {
      lastCheckAt: null,
      nextCheckAt: null
    },
    stockState: {
      normalHash: null,
      mirageHash: null,
      lastStockAt: null
    }
  }
};

export const STOCK_SOURCE_URL = "https://fruityblox.com/stock";
export const HISTORY_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
export const COMMAND_COOLDOWN_MS = 4_000;
export const EMERGENCY_ALERT_REPETITIONS = 3;
export const EMERGENCY_ALERT_INTERVAL_MS = 10 * 60 * 1000;
export const SCHEDULER_SAFETY_DELAY_MS = 15_000;
export const FALLBACK_STOCK_RETRY_MS = 5 * 60 * 1000;
export const GROUP_METADATA_TTL_SECONDS = 120;
