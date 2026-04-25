import { FALLBACK_STOCK_RETRY_MS, SCHEDULER_SAFETY_DELAY_MS } from "../config/default-config.js";
import { toRelativeWindow } from "../utils/time.js";

export class StockScheduler {
  constructor({ config, stockService, alertService, logger }) {
    this.config = config;
    this.stockService = stockService;
    this.alertService = alertService;
    this.logger = logger;
    this.timeout = null;
    this.started = false;
  }

  async start() {
    if (this.started || !this.config.stockCheckEnabled) {
      return;
    }

    this.started = true;
    await this.runCycle("startup");
  }

  stop() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    this.started = false;
  }

  async runCycle(trigger) {
    try {
      const result = await this.stockService.refreshStock({ trigger });
      await this.alertService.notifyStockChange(result);
      this.scheduleNext(result.snapshot);
    } catch (error) {
      this.logger.error("scheduler", "Falha ao atualizar stock.", error);
      this.scheduleFallback();
    }
  }

  scheduleNext(snapshot) {
    const nextCheckAt = this.stockService.getNextCheckAt(snapshot);
    const waitMs = (toRelativeWindow(nextCheckAt) ?? FALLBACK_STOCK_RETRY_MS) + SCHEDULER_SAFETY_DELAY_MS;

    this.timeout = setTimeout(() => {
      this.runCycle("scheduled").catch((error) => {
        this.logger.error("scheduler", "Falha no ciclo agendado.", error);
      });
    }, waitMs);

    this.logger.info("scheduler", `Proxima verificacao agendada para ${nextCheckAt}.`);
  }

  scheduleFallback() {
    this.timeout = setTimeout(() => {
      this.runCycle("retry").catch((error) => {
        this.logger.error("scheduler", "Falha no retry de stock.", error);
      });
    }, FALLBACK_STOCK_RETRY_MS);
  }
}
