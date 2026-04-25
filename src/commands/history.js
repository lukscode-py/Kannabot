import { formatDateTime } from "../utils/time.js";
import { withPersona } from "../messages/personality.js";

function groupMatches(matches) {
  const grouped = new Map();

  for (const entry of matches) {
    const key = String(entry.detectedAt);

    if (!grouped.has(key)) {
      grouped.set(key, {
        detectedAt: entry.detectedAt,
        dealers: new Set()
      });
    }

    grouped.get(key).dealers.add(entry.dealerType);
  }

  return [...grouped.values()];
}

export default {
  name: "history",
  async execute(context) {
    const query = context.args.join(" ");

    if (!query) {
      await context.reply(`Uso: ${context.config.prefix}history fruta`);
      return;
    }

    const fruit = context.stockService.resolveFruit(query);

    if (!fruit) {
      await context.reply("Nao encontrei essa fruta para consultar historico.");
      return;
    }

    const matches = groupMatches(context.database.findHistoryByFruit(fruit.key)).slice(0, 5);

    if (!matches.length) {
      await context.reply(`Nenhum historico recente de ${fruit.name}.`);
      return;
    }

    await context.reply(withPersona("historyInfo", [
      `📜 Historico recente de ${fruit.name}`,
      ...matches.map((entry) => `- ${formatDateTime(entry.detectedAt, context.config.language, context.config.timezone)} | lojas ${[...entry.dealers].join(", ")}`)
    ].join("\n")));
  }
};
