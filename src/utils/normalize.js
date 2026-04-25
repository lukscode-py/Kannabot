export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizePhoneNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeFruitKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

export function compactSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
