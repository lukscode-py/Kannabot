import { InstanceStore } from "./instance-store.js";
import { WhatsAppInstance } from "./whatsapp-instance.js";
import { logger } from "../lib/logger.js";

export class InstanceManager {
  constructor(store = new InstanceStore()) {
    this.store = store;
    this.instances = new Map();
  }

  async init() {
    await this.store.init();
  }

  async startSavedInstances() {
    return this.startSelectedInstances();
  }

  async startSelectedInstances(instanceIds = []) {
    const savedInstances = await this.store.listInstances();

    if (!savedInstances.length) {
      logger.info("manager", "Nenhuma instancia salva encontrada.");
      return [];
    }

    const selected = instanceIds.length
      ? savedInstances.filter((metadata) => instanceIds.includes(metadata.id))
      : savedInstances;

    if (!selected.length) {
      logger.warn("manager", "Nenhuma instancia valida foi selecionada para iniciar.");
      return [];
    }

    logger.info("manager", `${selected.length} instancia(s) selecionada(s) para iniciar.`);

    for (const metadata of selected) {
      await this.startInstance(metadata.id, metadata);
    }

    return selected;
  }

  async createInstance({ instanceId, loginMethod, phoneNumber }) {
    const metadata = await this.store.ensureInstance(instanceId, {
      loginMethod,
      phoneNumber: phoneNumber || null
    });

    await this.store.saveInstance(instanceId, {
      ...metadata,
      loginMethod,
      phoneNumber: phoneNumber || null
    });

    await this.startInstance(instanceId, {
      ...metadata,
      loginMethod,
      phoneNumber: phoneNumber || null
    });
  }

  async startInstance(instanceId, metadata) {
    const running = this.instances.get(instanceId);

    if (running) {
      logger.warn("manager", `Instancia ${instanceId} ja esta em execucao.`);
      return running;
    }

    const instance = new WhatsAppInstance({
      instanceId,
      store: this.store,
      loginMethod: metadata.loginMethod,
      phoneNumber: metadata.phoneNumber
    });

    this.instances.set(instanceId, instance);
    await instance.start();
    return instance;
  }

  async listInstances() {
    const saved = await this.store.listInstances();

    return saved.map((instance) => ({
      ...instance,
      running: this.instances.has(instance.id)
    }));
  }

  async shutdown() {
    const stopPromises = [];

    for (const instance of this.instances.values()) {
      stopPromises.push(instance.stop());
    }

    await Promise.allSettled(stopPromises);
    await this.store.close?.();
  }
}
