import { pickMessage } from "../messages/personality.js";

async function toggleGroupFlag(context, key, enabled, successText) {
  if (!await context.access.assertGroupAdmin(context)) {
    return;
  }

  await context.database.updateGroup(context.chatId, {
    [key]: enabled
  });

  await context.reply(`${pickMessage("success")}\n${successText}`);
}

export const addGroupAlertStock = {
  name: "addgroupalertstock",
  async execute(context) {
    await toggleGroupFlag(context, "stockAlertEnabled", true, "Alertas detalhados de stock ativados neste grupo.");
  }
};

export const removeGroupAlertStock = {
  name: "removegroupalertstock",
  async execute(context) {
    await toggleGroupFlag(context, "stockAlertEnabled", false, "Alertas detalhados de stock removidos deste grupo.");
  }
};

export const addStockNotifyGroup = {
  name: "addstocknotifygroup",
  async execute(context) {
    await toggleGroupFlag(context, "stockNotifyEnabled", true, "Notificacoes rapidas de stock ativadas neste grupo.");
  }
};

export const removeStockNotifyGroup = {
  name: "removestocknotifygroup",
  async execute(context) {
    await toggleGroupFlag(context, "stockNotifyEnabled", false, "Notificacoes rapidas de stock removidas deste grupo.");
  }
};

export const addGroupEmergency = {
  name: "addgroupemergency",
  async execute(context) {
    await toggleGroupFlag(context, "emergencyEnabled", true, "Modo emergencia ativado neste grupo.");
  }
};

export const removeGroupEmergency = {
  name: "removegroupemergency",
  async execute(context) {
    await toggleGroupFlag(context, "emergencyEnabled", false, "Modo emergencia desativado neste grupo.");
  }
};

export const listGroupsAlerts = {
  name: "listgroupsalerts",
  async execute(context) {
    if (!await context.access.assertOwner(context)) {
      return;
    }

    const groups = context.database.listGroups();

    if (!groups.length) {
      await context.reply("Nenhum grupo registrado nos alertas ainda.");
      return;
    }

    await context.reply([
      "📊 Grupos cadastrados",
      ...groups.map((group) => {
        const flags = [
          group.stockAlertEnabled ? "stock" : null,
          group.stockNotifyEnabled ? "notify" : null,
          group.emergencyEnabled ? "emergency" : null
        ].filter(Boolean).join(", ") || "sem flags";

        return `- ${group.id} => ${flags}`;
      })
    ].join("\n"));
  }
};
