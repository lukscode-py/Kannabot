import { formatDateTime } from "../utils/time.js";
import { pickMessage, withPersona } from "../messages/personality.js";

function formatPrice(value) {
  if (value === null || value === undefined) {
    return "desconhecido";
  }

  return new Intl.NumberFormat("pt-BR").format(value);
}

export default {
  name: "fruit",
  async execute(context) {
    const query = context.args.join(" ");

    if (!query) {
      await context.reply(`Uso: ${context.config.prefix}fruit nome`);
      return;
    }

    const fruit = context.stockService.resolveFruit(query);

    if (!fruit) {
      await context.reply(pickMessage("notFound"));
      return;
    }

    const roles = fruit.roles?.length ? fruit.roles.join(", ") : "nao definido";
    const stockLabel = fruit.currentlyInNormalStock
      ? "Dealer Normal"
      : fruit.currentlyInMirageStock
        ? "Mirage"
        : "Nao";
    const caption = withPersona("fruitInfo", [
      `🍎 ${fruit.name} / ${fruit.namePt}`,
      `Raridade: ${fruit.rarity}`,
      `Tipo: ${fruit.type}`,
      `Funcoes: ${roles}`,
      `Preco Beli: ${formatPrice(fruit.beliPrice)}`,
      `Perm Robux: ${formatPrice(fruit.permRobuxPrice)}`,
      `Valor geral/meta: ${formatPrice(fruit.value)}`,
      `Na loja agora: ${stockLabel}`,
      `Ultima aparicao: ${fruit.lastSeenAt ? formatDateTime(fruit.lastSeenAt, context.config.language, context.config.timezone) : "sem registro"}`,
      `Descricao: ${fruit.description}`,
      fruit.image ? `Imagem: ${fruit.image}` : null
    ].filter(Boolean).join("\n"));

    if (fruit.image) {
      await context.reply({
        image: {
          url: fruit.image
        },
        caption
      });
      return;
    }

    await context.reply(caption);
  }
};
