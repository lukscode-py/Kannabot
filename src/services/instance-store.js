import { mongoConnection } from "../lib/mongo-connection.js";

const INSTANCES_COLLECTION = "bot_instances";

export class InstanceStore {
  constructor(connection = mongoConnection) {
    this.connection = connection;
  }

  async init() {
    await this.connection.connect();
  }

  async listInstances() {
    await this.init();
    const collection = await this.connection.collection(INSTANCES_COLLECTION);
    const items = await collection.find({}).toArray();
    return items
      .map(({ _id, ...data }) => ({ id: _id, ...data }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getInstance(instanceId) {
    const collection = await this.connection.collection(INSTANCES_COLLECTION);
    const document = await collection.findOne({ _id: instanceId });

    if (!document) {
      return null;
    }

    const { _id, ...data } = document;
    return {
      id: _id,
      ...data
    };
  }

  async saveInstance(instanceId, data) {
    const collection = await this.connection.collection(INSTANCES_COLLECTION);
    await collection.updateOne(
      { _id: instanceId },
      {
        $set: {
          ...data,
          id: instanceId,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );
  }

  async updateInstance(instanceId, patch) {
    const current = (await this.getInstance(instanceId)) || {
      id: instanceId,
      createdAt: new Date().toISOString()
    };

    await this.saveInstance(instanceId, {
      ...current,
      ...patch
    });
  }

  async ensureInstance(instanceId, seed = {}) {
    const current = await this.getInstance(instanceId);

    if (current) {
      return current;
    }

    const data = {
      id: instanceId,
      createdAt: new Date().toISOString(),
      ...seed
    };

    await this.saveInstance(instanceId, data);
    return this.getInstance(instanceId);
  }

  async hasSession(instanceId) {
    return Boolean(await this.getInstance(instanceId));
  }

  async close() {
    await this.connection.close();
  }
}
