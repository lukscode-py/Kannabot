export const addEmergencyFruit = {
  name: "addemergencyfruit",
  async execute(context) {
    if (!await context.access.assertOwner(context)) {
      return;
    }

    const query = context.args.join(" ");
    const fruit = context.stockService.resolveFruit(query);

    if (!fruit) {
      await context.reply("Nao consegui resolver essa fruta para a lista de emergencia.");
      return;
    }

    const current = context.database.getRuntimeConfig().emergencyFruits;
    await context.database.setEmergencyFruits([...current, fruit.key]);
    await context.reply(`Fruta ${fruit.name} adicionada ao modo emergencia.`);
  }
};

export const removeEmergencyFruit = {
  name: "removeemergencyfruit",
  async execute(context) {
    if (!await context.access.assertOwner(context)) {
      return;
    }

    const query = context.args.join(" ");
    const fruit = context.stockService.resolveFruit(query);

    if (!fruit) {
      await context.reply("Nao consegui resolver essa fruta para remocao.");
      return;
    }

    const current = context.database.getRuntimeConfig().emergencyFruits;
    await context.database.setEmergencyFruits(current.filter((item) => item !== fruit.key));
    await context.reply(`Fruta ${fruit.name} removida do modo emergencia.`);
  }
};

export const listEmergencyFruit = {
  name: "listergencyfruit",
  aliases: ["listemergencyfruit"],
  async execute(context) {
    const fruits = context.database.getRuntimeConfig().emergencyFruits;
    await context.reply([
      "🚨 Frutas monitoradas no modo emergencia",
      ...fruits.map((fruit) => `- ${fruit}`)
    ].join("\n"));
  }
};
