import { BufferJSON, initAuthCreds, proto } from "baileys";
import { mongoConnection } from "../lib/mongo-connection.js";

const AUTH_COLLECTION = "wa_auth";

function buildDocumentId(instanceId, category, key) {
  return `${instanceId}:${category}:${key}`;
}

function serializeValue(value) {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function deserializeValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(value), BufferJSON.reviver);
}

export async function useMongoAuthState(instanceId, connection = mongoConnection) {
  const collection = await connection.collection(AUTH_COLLECTION);
  const credsDoc = await collection.findOne({
    _id: buildDocumentId(instanceId, "creds", "creds")
  });
  const creds = deserializeValue(credsDoc?.value) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          if (!ids.length) {
            return {};
          }

          const documents = await collection.find({
            _id: {
              $in: ids.map((id) => buildDocumentId(instanceId, type, id))
            }
          }).toArray();
          const mapped = new Map(documents.map((document) => [document.key, document.value]));
          const result = {};

          for (const id of ids) {
            let value = deserializeValue(mapped.get(id));

            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }

            result[id] = value;
          }

          return result;
        },
        set: async (data) => {
          const operations = [];

          for (const category of Object.keys(data)) {
            for (const key of Object.keys(data[category])) {
              const value = data[category][key];
              const filter = {
                _id: buildDocumentId(instanceId, category, key)
              };

              if (value) {
                operations.push({
                  updateOne: {
                    filter,
                    update: {
                      $set: {
                        _id: filter._id,
                        instanceId,
                        category,
                        key,
                        value: serializeValue(value),
                        updatedAt: new Date()
                      }
                    },
                    upsert: true
                  }
                });
              } else {
                operations.push({
                  deleteOne: {
                    filter
                  }
                });
              }
            }
          }

          if (operations.length) {
            await collection.bulkWrite(operations, { ordered: false });
          }
        }
      }
    },
    saveCreds: async () => {
      await collection.updateOne(
        {
          _id: buildDocumentId(instanceId, "creds", "creds")
        },
        {
          $set: {
            _id: buildDocumentId(instanceId, "creds", "creds"),
            instanceId,
            category: "creds",
            key: "creds",
            value: serializeValue(creds),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    }
  };
}

export function serializeAuthValue(value) {
  return serializeValue(value);
}
