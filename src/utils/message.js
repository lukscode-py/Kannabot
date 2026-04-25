import { compactSpaces } from "./normalize.js";

function unwrapMessageContainer(payload) {
  if (!payload) {
    return payload;
  }

  if (payload.ephemeralMessage?.message) {
    return unwrapMessageContainer(payload.ephemeralMessage.message);
  }

  if (payload.viewOnceMessage?.message) {
    return unwrapMessageContainer(payload.viewOnceMessage.message);
  }

  if (payload.viewOnceMessageV2?.message) {
    return unwrapMessageContainer(payload.viewOnceMessageV2.message);
  }

  if (payload.documentWithCaptionMessage?.message) {
    return unwrapMessageContainer(payload.documentWithCaptionMessage.message);
  }

  return payload;
}

export function getMessageText(message) {
  if (!message?.message) {
    return "";
  }

  const payload = unwrapMessageContainer(message.message);

  return compactSpaces(
    payload.conversation
      || payload.extendedTextMessage?.text
      || payload.imageMessage?.caption
      || payload.videoMessage?.caption
      || payload.documentMessage?.caption
      || payload.buttonsResponseMessage?.selectedButtonId
      || payload.listResponseMessage?.title
      || payload.templateButtonReplyMessage?.selectedId
      || payload.buttonsMessage?.contentText
      || ""
  );
}

export function getSenderId(message) {
  return (
    message?.key?.participant
    || message?.key?.remoteJid
    || ""
  );
}

export function isGroupJid(jid) {
  return String(jid || "").endsWith("@g.us");
}

export function getChatId(message) {
  return message?.key?.remoteJid || "";
}
