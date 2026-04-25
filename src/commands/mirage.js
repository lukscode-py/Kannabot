import { formatDateTime, formatDuration } from "../utils/time.js";
import { withPersona } from "../messages/personality.js";

export default {
  name: "mirage",
  async execute(context) {
    const snapshot = context.stockService.getSnapshot() || (await context.stockService.refreshStock({ trigger: "command:mirage" })).snapshot;
    const fruits = snapshot.mirage.fruits.length
      ? snapshot.mirage.fruits.map((fruit) => `- ${fruit.name}`).join("\n")
      : "- Nenhuma fruta detectada";

    await context.reply(withPersona("stockStatus", [
      "🌌 Mirage Stock",
      fruits,
      `Proxima troca: ${formatDateTime(snapshot.mirage.nextRotationAt, context.config.language, context.config.timezone)}`,
      `Tempo restante: ${formatDuration(snapshot.mirage.remainingMs || 0)}`
    ].join("\n")));
  }
};
