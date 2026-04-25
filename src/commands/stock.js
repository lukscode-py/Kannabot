import { formatDateTime, formatDuration } from "../utils/time.js";
import { withPersona } from "../messages/personality.js";

function formatDealer(title, dealer, locale, timeZone) {
  const fruits = dealer.fruits.length
    ? dealer.fruits.map((fruit) => `- ${fruit.name}`).join("\n")
    : "- Nenhuma fruta detectada";

  return [
    title,
    fruits,
    `Proxima troca: ${formatDateTime(dealer.nextRotationAt, locale, timeZone)}`,
    `Tempo restante: ${formatDuration(dealer.remainingMs || 0)}`
  ].join("\n");
}

export default {
  name: "stock",
  async execute(context) {
    const snapshot = context.stockService.getSnapshot() || (await context.stockService.refreshStock({ trigger: "command:stock" })).snapshot;
    await context.reply(withPersona("stockStatus", [
      formatDealer("🏪 Dealer Normal", snapshot.normal, context.config.language, context.config.timezone),
      "",
      formatDealer("🌌 Dealer Mirage", snapshot.mirage, context.config.language, context.config.timezone)
    ].join("\n")));
  }
};
