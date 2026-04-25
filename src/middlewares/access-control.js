import { normalizePhoneNumber } from "../utils/normalize.js";
import { isGroupJid } from "../utils/message.js";
import { pickMessage } from "../messages/personality.js";

export function createAccessControl() {
  return {
    isOwner(context) {
      return normalizePhoneNumber(context.senderNumber) === normalizePhoneNumber(context.config.ownerNumber);
    },

    isGroup(context) {
      return isGroupJid(context.chatId);
    },

    async isAdmin(context) {
      if (!this.isGroup(context)) {
        return false;
      }

      const metadata = await context.getGroupMetadata();
      const participant = metadata?.participants?.find((item) => item.id === context.senderId);
      return ["admin", "superadmin"].includes(participant?.admin);
    },

    async assertOwner(context) {
      if (this.isOwner(context)) {
        return true;
      }

      await context.reply(pickMessage("noPermission"));
      return false;
    },

    async assertGroupAdmin(context) {
      if (!this.isGroup(context)) {
        await context.reply(pickMessage("groupOnly"));
        return false;
      }

      if (this.isOwner(context) || await this.isAdmin(context)) {
        return true;
      }

      await context.reply(pickMessage("noPermission"));
      return false;
    },

    async assertGroup(context) {
      if (this.isGroup(context)) {
        return true;
      }

      await context.reply(pickMessage("groupOnly"));
      return false;
    }
  };
}
