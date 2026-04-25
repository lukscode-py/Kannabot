import { getChatId, getMessageText, getSenderId, isGroupJid } from "../utils/message.js";
import { normalizePhoneNumber } from "../utils/normalize.js";
import { pickMessage } from "../messages/personality.js";

export function createMessageUpsertHandler(runtime) {
  return async function handleMessageUpsert(event) {
    if (event.type !== "notify" && event.type !== "append") {
      return;
    }

    for (const message of event.messages || []) {
      if (!message?.message || message.key?.fromMe || message.messageStubType) {
        continue;
      }

      const chatId = getChatId(message);
      const senderId = getSenderId(message);
      const senderNumber = normalizePhoneNumber(senderId);
      const text = getMessageText(message);
      const syncType = event.type || "unknown";

      if (!chatId || !senderId) {
        continue;
      }

      runtime.logger.info(
        `msg:${runtime.instanceId}`,
        `historico=${syncType} chat=${chatId} sender=${senderId} texto="${text || "[sem texto]"}"`
      );

      if (!runtime.commandService || !runtime.config) {
        await runtime.init();
      }

      if (runtime.config.autoRead) {
        await runtime.socket.readMessages([message.key]).catch(() => {});
      }

      if (isGroupJid(chatId)) {
        runtime.alertService.cancelEmergencyForGroup(chatId);
        await runtime.database.updateGroup(chatId, {
          lastActivityAt: new Date().toISOString()
        });
      }

      if (!text.startsWith(runtime.config.prefix)) {
        continue;
      }

      const context = {
        socket: runtime.socket,
        database: runtime.database,
        stockService: runtime.stockService,
        alertService: runtime.alertService,
        config: runtime.config,
        access: runtime.access,
        logger: runtime.logger,
        chatId,
        senderId,
        senderNumber,
        message,
        text,
        args: [],
        async reply(content) {
          try {
            const messageContent = typeof content === "string" ? { text: content || pickMessage("error") } : content;
            const sendOptions = {
              sendEphemeral: true
            };

            if (runtime.config.autoTyping) {
              await runtime.socket.sendPresenceUpdate("composing", chatId).catch(() => {});
            }

            if (message?.key?.id) {
              sendOptions.quoted = message;
            }

            await runtime.socket.sendMessage(chatId, messageContent, sendOptions);
          } catch (error) {
            runtime.logger.error("commands", "Falha ao responder mensagem.", error);
          }
        },
        async getGroupMetadata() {
          return runtime.getGroupMetadata(chatId);
        }
      };

      try {
        const handled = await runtime.commandService.run(context);

        if (handled) {
          runtime.logger.info(
            `cmd:${runtime.instanceId}`,
            `comando=${context.commandName || "desconhecido"} sender=${senderId} chat=${chatId}`
          );
        }
      } catch (error) {
        runtime.logger.error("commands", "Erro ao processar comando.", error);
        await context.reply(pickMessage("error"));
      }
    }
  };
}
