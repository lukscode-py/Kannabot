import { formatDuration } from "../utils/time.js";

export default {
  name: "timeleft",
  async execute(context) {
    const snapshot = context.stockService.getSnapshot() || (await context.stockService.refreshStock({ trigger: "command:timeleft" })).snapshot;

    await context.reply([
      "⏳ Janela Atual",
      `Dealer Normal: ${formatDuration(snapshot.normal.remainingMs || 0)}`,
      `Mirage: ${formatDuration(snapshot.mirage.remainingMs || 0)}`
    ].join("\n"));
  }
};
