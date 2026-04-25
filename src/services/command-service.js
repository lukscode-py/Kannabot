import { COMMAND_COOLDOWN_MS } from "../config/default-config.js";
import { COMMANDS } from "../commands/index.js";
import { pickMessage } from "../messages/personality.js";

export class CommandService {
  constructor({ config, database, stockService, alertService, access, logger }) {
    this.config = config;
    this.database = database;
    this.stockService = stockService;
    this.alertService = alertService;
    this.access = access;
    this.logger = logger;
    this.commandIndex = new Map();
    this.cooldowns = new Map();

    for (const command of COMMANDS) {
      this.commandIndex.set(command.name, command);

      for (const alias of command.aliases || []) {
        this.commandIndex.set(alias, command);
      }
    }
  }

  parse(text) {
    if (!text.startsWith(this.config.prefix)) {
      return null;
    }

    const raw = text.slice(this.config.prefix.length).trim();

    if (!raw) {
      return null;
    }

    const [name, ...args] = raw.split(/\s+/);
    return {
      name: name.toLowerCase(),
      args
    };
  }

  async run(context) {
    const parsed = this.parse(context.text);

    if (!parsed) {
      return false;
    }

    const command = this.commandIndex.get(parsed.name);

    if (!command) {
      await context.reply("Comando desconhecido. Use /menu para ver o painel.");
      return true;
    }

    const cooldownKey = `${context.senderId}:${command.name}`;
    const lastUse = this.cooldowns.get(cooldownKey);

    if (lastUse && Date.now() - lastUse < COMMAND_COOLDOWN_MS) {
      await context.reply(pickMessage("cooldown"));
      return true;
    }

    this.cooldowns.set(cooldownKey, Date.now());
    context.args = parsed.args;
    context.commandName = command.name;

    await this.database.touchUser(context.senderId);
    await command.execute(context);
    return true;
  }
}
