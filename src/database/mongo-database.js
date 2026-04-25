import { DATABASE_DEFAULTS, HISTORY_RETENTION_MS } from "../config/default-config.js";
import { mongoConnection } from "../lib/mongo-connection.js";

const STATE_COLLECTION = "bot_state";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function buildHistoryHash(fruits = []) {
  return fruits
    .map((fruit) => String(fruit?.key || "").toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
}

export class MongoDatabase {
  static shared = {
    initialized: false,
    initializing: null,
    cache: {}
  };

  constructor(connection = mongoConnection) {
    this.connection = connection;
  }

  async init() {
    if (MongoDatabase.shared.initialized) {
      return;
    }

    if (MongoDatabase.shared.initializing) {
      await MongoDatabase.shared.initializing;
      return;
    }

    MongoDatabase.shared.initializing = this.loadState();

    try {
      await MongoDatabase.shared.initializing;
      MongoDatabase.shared.initialized = true;
    } finally {
      MongoDatabase.shared.initializing = null;
    }
  }

  async loadState() {
    const collection = await this.connection.collection(STATE_COLLECTION);

    for (const [name, fallback] of Object.entries(DATABASE_DEFAULTS)) {
      const document = await collection.findOne({ _id: name });

      if (!document) {
        const initial = {
          _id: name,
          ...clone(fallback)
        };
        await collection.updateOne(
          { _id: name },
          { $set: initial },
          { upsert: true }
        );
        MongoDatabase.shared.cache[name] = clone(fallback);
        continue;
      }

      const { _id, ...data } = document;
      MongoDatabase.shared.cache[name] = {
        ...clone(fallback),
        ...clone(data)
      };
    }

    await this.pruneHistory();
  }

  getCollection(name) {
    return MongoDatabase.shared.cache[name];
  }

  async saveCollection(name) {
    const current = this.getCollection(name);
    current.updatedAt = nowIso();

    const collection = await this.connection.collection(STATE_COLLECTION);
    await collection.updateOne(
      { _id: name },
      { $set: { _id: name, ...clone(current) } },
      { upsert: true }
    );
  }

  getGroup(groupId) {
    const groups = this.getCollection("groups");

    if (!groups.items[groupId]) {
      groups.items[groupId] = {
        id: groupId,
        stockAlertEnabled: false,
        stockNotifyEnabled: false,
        emergencyEnabled: false,
        lastActivityAt: null,
        updatedAt: null
      };
    }

    return groups.items[groupId];
  }

  async updateGroup(groupId, patch) {
    const group = this.getGroup(groupId);
    Object.assign(group, patch, { updatedAt: nowIso() });
    await this.saveCollection("groups");
    return group;
  }

  listGroups() {
    return Object.values(this.getCollection("groups").items);
  }

  listAlertGroups(key) {
    return this.listGroups().filter((group) => Boolean(group[key]));
  }

  getUser(userId) {
    const users = this.getCollection("users");

    if (!users.items[userId]) {
      users.items[userId] = {
        id: userId,
        commandsUsed: 0,
        lastCommandAt: null,
        updatedAt: null
      };
    }

    return users.items[userId];
  }

  async touchUser(userId) {
    const user = this.getUser(userId);
    user.commandsUsed += 1;
    user.lastCommandAt = nowIso();
    user.updatedAt = nowIso();
    await this.saveCollection("users");
    return user;
  }

  getRuntimeConfig() {
    return this.getCollection("config");
  }

  async updateRuntimeConfig(patch) {
    const runtime = this.getRuntimeConfig();
    Object.assign(runtime, patch, { updatedAt: nowIso() });
    await this.saveCollection("config");
    return runtime;
  }

  async setEmergencyFruits(fruits) {
    const runtime = this.getRuntimeConfig();
    runtime.emergencyFruits = Array.from(new Set(fruits));
    await this.saveCollection("config");
    return runtime.emergencyFruits;
  }

  async recordHistory({ dealerType, fruits, detectedAt }) {
    const history = this.getCollection("history");
    const stockHash = buildHistoryHash(fruits);
    const existing = history.items.find((entry) => (
      entry.dealerType === dealerType
      && (entry.stockHash || "") === stockHash
    ));

    if (existing) {
      return false;
    }

    history.items.push({
      dealerType,
      detectedAt: detectedAt || nowIso(),
      fruits,
      stockHash
    });
    await this.pruneHistory();
    await this.saveCollection("history");
    return true;
  }

  async pruneHistory() {
    const history = this.getCollection("history");
    const cutoff = Date.now() - HISTORY_RETENTION_MS;
    const seen = new Set();

    history.items = history.items.filter((entry) => {
      const timestamp = new Date(entry.detectedAt).getTime();
      const stockHash = entry.stockHash || buildHistoryHash(entry.fruits);
      entry.stockHash = stockHash;

      if (!Number.isFinite(timestamp) || timestamp < cutoff) {
        return false;
      }

      const key = `${entry.dealerType}:${stockHash}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

    if (MongoDatabase.shared.initialized) {
      await this.saveCollection("history");
    }
  }

  findHistoryByFruit(fruitKey) {
    const target = String(fruitKey || "").toLowerCase();

    return this.getCollection("history").items
      .filter((entry) => entry.fruits.some((fruit) => String(fruit.key).toLowerCase() === target))
      .sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt));
  }
}
