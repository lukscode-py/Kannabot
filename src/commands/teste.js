import { generateWAMessageFromContent, proto } from "baileys";
import { withPersona } from "../messages/personality.js";

export default {
  name: "teste",
  async execute(context) {
    const messageText = withPersona(
      "menuIntro",
      [
        "🧪 Teste de botoes do Nexus Nex",
        "Se os botoes aparecerem, toque em um deles."
      ].join("\n")
    );

    const fallbackText = [
      messageText,
      "",
      "Se os botoes nao aparecerem, este cliente/versao do WhatsApp nao esta renderizando botoes classicos do protocolo Web.",
      "",
      "Atalhos:",
      `- ${context.config.prefix}stock`,
      `- ${context.config.prefix}mirage`,
      `- ${context.config.prefix}menu`
    ].join("\n");

    try {
      const content = {
        buttonsMessage: {
          contentText: messageText,
          footerText: "Teste de compatibilidade",
          headerType: proto.Message.ButtonsMessage.HeaderType.EMPTY,
          buttons: [
            {
              buttonId: `${context.config.prefix}stock`,
              buttonText: {
                displayText: "Ver Stock"
              },
              type: proto.Message.ButtonsMessage.Button.Type.RESPONSE
            },
            {
              buttonId: `${context.config.prefix}mirage`,
              buttonText: {
                displayText: "Ver Mirage"
              },
              type: proto.Message.ButtonsMessage.Button.Type.RESPONSE
            },
            {
              buttonId: `${context.config.prefix}menu`,
              buttonText: {
                displayText: "Abrir Menu"
              },
              type: proto.Message.ButtonsMessage.Button.Type.RESPONSE
            }
          ]
        }
      };

      const waMessage = generateWAMessageFromContent(
        context.chatId,
        content,
        {
          userJid: context.socket.user?.id,
          quoted: context.message
        }
      );

      await context.socket.relayMessage(
        context.chatId,
        waMessage.message,
        {
          messageId: waMessage.key.id
        }
      );

      await context.reply(
        "Se os botoes nao apareceram acima, o seu cliente nao esta aceitando botoes classicos por esta conexao."
      );
    } catch (error) {
      context.logger.error("commands", "Falha ao enviar mensagem com botoes.", error);
      await context.reply(fallbackText);
    }
  }
};
