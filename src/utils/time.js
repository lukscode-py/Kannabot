export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];

  if (hours) {
    parts.push(`${hours}h`);
  }

  if (minutes || hours) {
    parts.push(`${minutes}m`);
  }

  parts.push(`${seconds}s`);
  return parts.join(" ");
}

export function formatDateTime(value, locale = "pt-BR", timeZone = "America/Bahia") {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "desconhecido";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone
  }).format(date);
}

export function toRelativeWindow(target) {
  const timestamp = new Date(target).getTime();

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(0, timestamp - Date.now());
}
