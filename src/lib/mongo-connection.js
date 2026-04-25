import { MongoClient, ServerApiVersion } from "mongodb";
import { getMongoConfig } from "../config/mongo-config.js";

export class MongoConnection {
  constructor() {
    this.client = null;
    this.db = null;
    this.connecting = null;
  }

  async connect() {
    if (this.db) {
      return this.db;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = this.createConnection();

    try {
      this.db = await this.connecting;
      return this.db;
    } finally {
      this.connecting = null;
    }
  }

  async createConnection() {
    const { uri, dbName, appName } = getMongoConfig();

    if (!uri) {
      throw new Error(
        "MONGODB_URI nao configurada. Defina a string de conexao MongoDB antes de iniciar o bot."
      );
    }

    this.client = new MongoClient(uri, {
      appName,
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
      }
    });

    await this.client.connect();
    return this.client.db(dbName);
  }

  async collection(name) {
    const db = await this.connect();
    return db.collection(name);
  }

  async listCollectionNames() {
    const db = await this.connect();
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    return collections.map((item) => item.name);
  }

  async close() {
    if (!this.client) {
      return;
    }

    await this.client.close();
    this.client = null;
    this.db = null;
    this.connecting = null;
  }
}

export const mongoConnection = new MongoConnection();
