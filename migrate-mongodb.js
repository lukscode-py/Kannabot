import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { BufferJSON } from "baileys";
import { DATABASE_DEFAULTS, DEFAULT_CONFIG } from "./src/config/default-config.js";
import { PROJECT_ROOT } from "./src/config/constants.js";
import { mongoConnection } from "./src/lib/mongo-connection.js";
import { readJson } from "./src/lib/file-db.js";
import { serializeAuthValue } from "./src/services/mongo-auth-state.js";

const PROJECT_COLLECTIONS = [
  "bot_app_config",
  "bot_state",
  "bot_instances",
  "wa_auth"
];
const AUTH_KEY_CATEGORIES = [
  "app-state-sync-version",
  "app-state-sync-key",
  "sender-key-memory",
  "sender-key",
  "device-list",
  "lid-mapping",
  "pre-key",
  "session",
  "tctoken"
];

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw
  };
}

function parseAuthFileName(fileName) {
  const baseName = fileName.replace(/\.json$/i, "");

  for (const category of AUTH_KEY_CATEGORIES) {
    const prefix = `${category}-`;

    if (baseName.startsWith(prefix)) {
      return {
        category,
        key: baseName.slice(prefix.length)
      };
    }
  }

  return null;
}

async function resetDatabase({ resetAll }) {
  const db = await mongoConnection.connect();

  if (resetAll) {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();

    for (const collection of collections) {
      await db.collection(collection.name).deleteMany({});
      console.log(`Colecao limpa: ${collection.name}`);
    }

    return;
  }

  for (const name of PROJECT_COLLECTIONS) {
    await db.collection(name).deleteMany({});
    console.log(`Colecao limpa: ${name}`);
  }
}

async function importAppConfig() {
  const config = normalizeConfig(await readJson(path.join(PROJECT_ROOT, "config.json"), DEFAULT_CONFIG));
  const collection = await mongoConnection.collection("bot_app_config");

  await collection.updateOne(
    { _id: "app_config" },
    {
      $set: {
        _id: "app_config",
        ...config,
        updatedAt: new Date().toISOString()
      }
    },
    { upsert: true }
  );
}

async function importBotState() {
  const collection = await mongoConnection.collection("bot_state");
  const fileMap = {
    groups: path.join(PROJECT_ROOT, "database", "groups.json"),
    users: path.join(PROJECT_ROOT, "database", "users.json"),
    history: path.join(PROJECT_ROOT, "database", "history.json"),
    config: path.join(PROJECT_ROOT, "database", "config.json")
  };

  for (const [key, fallback] of Object.entries(DATABASE_DEFAULTS)) {
    const data = await readJson(fileMap[key], fallback);
    await collection.updateOne(
      { _id: key },
      {
        $set: {
          _id: key,
          ...data
        }
      },
      { upsert: true }
    );
  }
}

async function importInstances() {
  const sessionsDir = path.join(PROJECT_ROOT, "sessions");
  const instancesCollection = await mongoConnection.collection("bot_instances");
  const authCollection = await mongoConnection.collection("wa_auth");
  const entries = await fs.readdir(sessionsDir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const instanceId = entry.name;
    const instancePath = path.join(sessionsDir, instanceId, "instance.json");
    const authDir = path.join(sessionsDir, instanceId, "auth");
    const metadata = await readJson(instancePath, null);

    if (metadata) {
      await instancesCollection.updateOne(
        { _id: instanceId },
        {
          $set: {
            ...metadata,
            id: instanceId,
            migratedAt: new Date().toISOString()
          }
        },
        { upsert: true }
      );
    }

    const authFiles = await fs.readdir(authDir, { withFileTypes: true }).catch(() => []);

    for (const file of authFiles) {
      if (!file.isFile() || !file.name.endsWith(".json")) {
        continue;
      }

      const filePath = path.join(authDir, file.name);
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw, BufferJSON.reviver);

      if (file.name === "creds.json") {
        await authCollection.updateOne(
          { _id: `${instanceId}:creds:creds` },
          {
            $set: {
              _id: `${instanceId}:creds:creds`,
              instanceId,
              category: "creds",
              key: "creds",
              value: serializeAuthValue(parsed),
              updatedAt: new Date()
            }
          },
          { upsert: true }
        );
        continue;
      }

      const parsedFile = parseAuthFileName(file.name);

      if (!parsedFile) {
        continue;
      }

      const { category, key } = parsedFile;

      await authCollection.updateOne(
        { _id: `${instanceId}:${category}:${key}` },
        {
          $set: {
            _id: `${instanceId}:${category}:${key}`,
            instanceId,
            category,
            key,
            value: serializeAuthValue(parsed),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    }
  }
}

async function main() {
  const shouldResetProject = hasFlag("--reset-project");
  const shouldResetAll = hasFlag("--reset-all");

  if (shouldResetProject || shouldResetAll) {
    await resetDatabase({ resetAll: shouldResetAll });
  }

  await importAppConfig();
  await importBotState();
  await importInstances();

  console.log("Migracao concluida. Arquivos dinamicos enviados para o MongoDB.");
  console.log("Arquivos estaticos, imagens e base de referencia local foram ignorados.");
}

main()
  .catch((error) => {
    console.error("Falha na migracao MongoDB.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoConnection.close();
  });
