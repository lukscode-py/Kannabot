import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { InstanceManager } from "./services/instance-manager.js";
import { logger } from "./lib/logger.js";

process.on("unhandledRejection", (error) => {
  logger.error("app", "Promessa rejeitada sem tratamento.", error);
});

process.on("uncaughtException", (error) => {
  logger.error("app", "Excecao nao tratada.", error);
});

function sanitizeInstanceId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-");
}

async function askMenu(rl) {
  console.log("\n=== MENU ===");
  console.log("1. Criar nova instancia com QR Code");
  console.log("2. Criar nova instancia com Pairing Code");
  console.log("3. Listar instancias salvas");
  console.log("4. Iniciar instancias selecionadas");
  console.log("5. Iniciar todas as instancias salvas");
  console.log("6. Sair");

  return rl.question("Escolha uma opcao: ");
}

async function createQrInstance(rl, manager) {
  const rawId = await rl.question("Informe o nome da instancia: ");
  const instanceId = sanitizeInstanceId(rawId);

  if (!instanceId) {
    logger.warn("cli", "Nome de instancia invalido.");
    return;
  }

  await manager.createInstance({
    instanceId,
    loginMethod: "qr"
  });
}

async function createPairingInstance(rl, manager) {
  const rawId = await rl.question("Informe o nome da instancia: ");
  const rawPhone = await rl.question("Informe o numero com DDI/DDD (ex: 5574999999999): ");

  const instanceId = sanitizeInstanceId(rawId);
  const phoneNumber = rawPhone.replace(/\D/g, "");

  if (!instanceId) {
    logger.warn("cli", "Nome de instancia invalido.");
    return;
  }

  if (!phoneNumber) {
    logger.warn("cli", "Numero invalido para pairing code.");
    return;
  }

  await manager.createInstance({
    instanceId,
    loginMethod: "pairing",
    phoneNumber
  });
}

async function listInstances(manager) {
  const instances = await manager.listInstances();

  if (!instances.length) {
    console.log("\nNenhuma instancia salva encontrada.");
    return;
  }

  console.log("\nInstancias salvas:");

  for (const instance of instances) {
    console.log(
      `- ${instance.id} | metodo=${instance.loginMethod || "qr"} | em_execucao=${instance.running ? "sim" : "nao"}`
    );
  }
}

async function startSelectedInstances(rl, manager) {
  const instances = await manager.listInstances();

  if (!instances.length) {
    console.log("\nNenhuma instancia salva encontrada.");
    return;
  }

  console.log("\nInstancias disponiveis:");

  for (const instance of instances) {
    console.log(
      `- ${instance.id} | metodo=${instance.loginMethod || "qr"} | em_execucao=${instance.running ? "sim" : "nao"}`
    );
  }

  const rawSelection = await rl.question(
    "Informe os IDs separados por virgula das instancias que devem iniciar: "
  );

  const selectedIds = rawSelection
    .split(",")
    .map((item) => sanitizeInstanceId(item))
    .filter(Boolean);

  if (!selectedIds.length) {
    logger.warn("cli", "Nenhuma instancia valida foi informada.");
    return;
  }

  await manager.startSelectedInstances(selectedIds);
}

async function main() {
  const manager = new InstanceManager();
  await manager.init();

  const isRenderAuto = process.env.RENDER === "1";

  // 🔥 MODO RENDER (SEM CLI / SEM READLINE)
  if (isRenderAuto) {
    try {
      logger.info("app", "RENDER=1 detectado. Iniciando instancias automaticamente...");

      await manager.startSavedInstances();

      logger.info("app", "Instancias iniciadas. Processo rodando em modo servidor.");

      // Mantém processo vivo sem CLI
      return;
    } catch (error) {
      logger.error("app", "Erro ao iniciar instancias automaticamente.", error);
      process.exit(1);
    }
  }

  // 🔥 MODO CLI LOCAL
  const rl = readline.createInterface({ input, output });
  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;

    shuttingDown = true;
    logger.info("app", "Encerrando aplicacao...");
    rl.close();
    await manager.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (true) {
    const option = (await askMenu(rl)).trim();

    try {
      if (option === "1") {
        await createQrInstance(rl, manager);
        continue;
      }

      if (option === "2") {
        await createPairingInstance(rl, manager);
        continue;
      }

      if (option === "3") {
        await listInstances(manager);
        continue;
      }

      if (option === "4") {
        await startSelectedInstances(rl, manager);
        continue;
      }

      if (option === "5") {
        await manager.startSavedInstances();
        continue;
      }

      if (option === "6") {
        await shutdown();
        return;
      }

      logger.warn("cli", "Opcao invalida.");
    } catch (error) {
      logger.error("app", "Erro durante a execucao do menu.", error);
    }
  }
}

main().catch((error) => {
  logger.error("app", "Falha fatal ao iniciar aplicacao.", error);
  process.exit(1);
});
