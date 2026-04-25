import { buildMenu } from "../utils/menu.js";
import { withPersona } from "../messages/personality.js";

export default {
  name: "menu",
  aliases: ["help"],
  async execute(context) {
    await context.reply(withPersona("menuIntro", buildMenu({
      botName: context.config.botName,
      prefix: context.config.prefix
    })));
  }
};
