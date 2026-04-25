import path from "node:path";
import { DATABASE_DIR } from "../config/constants.js";
import { DATABASE_DEFAULTS, HISTORY_RETENTION_MS } from "../config/default-config.js";
import { ensureDir, pathExists, readJson, writeJson } from "../lib/file-db.js";

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

export class JsonDatabase {
  constructor(baseDir = DATABASE_DIR) {
    this.baseDir = baseDir;
    this.files = {
      groups: path.join(this.baseDir, "groups.json"),
      users: path.join(this.baseDir, "users.json"),
      history: path.join(this.baseDir, "history.json"),
      config: path.join(this.baseDir, "config.json")
    };
    this.cache = {};
  }

  async init() {
    await ensureDir(this.baseDir);

    for (const [key, filePath] of Object.entries(this.files)) {
      const exists = await pathExists(filePath);

      if (!exists) {
        await writeJson(filePath, clone(DATABASE_DEFAULTS[key]));
      }

      this.cache[key] = await readJson(filePath, clone(DATABASE_DEFAULTS[key]));
    }

    await this.pruneHistory();
  }

  getCollection(name) {
    return this.cache[name];
  }

  async saveCollection(name) {
    const current = this.cache[name];
    current.updatedAt = nowIso();
    await writeJson(this.files[name], current);
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
  }

  findHistoryByFruit(fruitKey) {
    const target = String(fruitKey || "").toLowerCase();

    return this.getCollection("history").items
      .filter((entry) => entry.fruits.some((fruit) => String(fruit.key).toLowerCase() === target))
      .sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt));
  }
}
