import crypto from "node:crypto";
import { STOCK_SOURCE_URL, FALLBACK_STOCK_RETRY_MS } from "../config/default-config.js";
import { formatDateTime } from "../utils/time.js";

const NEXT_ACTION = "000e834c372ac1b9cdffe4f36d95a76c33c66cbd36";
const NEXT_ROUTER_STATE_TREE = "[\"\",{\"children\":[\"stock\",{\"children\":[\"__PAGE__\",{},null,null]},null,null]},null,null,true]";
const STOCK_REQUEST_HEADERS = {
  accept: "text/x-component",
  "accept-language": "en-US,en;q=0.9,pt-BR;q=0.8",
  "content-type": "text/plain;charset=UTF-8",
  origin: "https://fruityblox.com",
  referer: "https://fruityblox.com/stock",
  "next-action": NEXT_ACTION,
  "next-router-state-tree": NEXT_ROUTER_STATE_TREE,
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0",
  cookie: "popupDismissed=true",
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  "sec-ch-ua": "\"Chromium\";v=\"126\", \"Not-A.Brand\";v=\"24\", \"Opera\";v=\"112\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"Linux\""
};
const TIME_API_TTL_MS = 60_000;
const TIME_API_ENDPOINTS = [
  (timeZone) => `https://worldtimeapi.org/api/timezone/${encodeURIComponent(timeZone)}`,
  (timeZone) => `https://timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(timeZone)}`
];

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.items)) {
    return value.items;
  }

  if (Array.isArray(value?.fruits)) {
    return value.fruits;
  }

  if (Array.isArray(value?.stock)) {
    return value.stock;
  }

  return [];
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function parseRemainingMs(section, nextRotationAt, nowMs) {
  const remaining = firstDefined(
    section?.remainingMs,
    section?.remaining_ms,
    section?.timeLeftMs,
    section?.time_left_ms,
    section?.remainingSeconds ? Number(section.remainingSeconds) * 1000 : undefined,
    section?.remaining_seconds ? Number(section.remaining_seconds) * 1000 : undefined,
    section?.timeLeftSeconds ? Number(section.timeLeftSeconds) * 1000 : undefined,
    section?.time_left_seconds ? Number(section.time_left_seconds) * 1000 : undefined
  );

  if (Number.isFinite(remaining)) {
    return Math.max(0, Number(remaining));
  }

  const nextMs = new Date(nextRotationAt).getTime();

  if (Number.isFinite(nextMs)) {
    return Math.max(0, nextMs - nowMs);
  }

  return null;
}

function computeAlignedNextRotationAt(nowMs, intervalHours) {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const elapsed = nowMs % intervalMs;
  const remainingMs = intervalMs - elapsed;
  return new Date(nowMs + remainingMs).toISOString();
}

function parseNextRotationAt(section, fallbackHours, nowMs) {
  const raw = firstDefined(
    section?.nextRotationAt,
    section?.next_rotation_at,
    section?.nextRefreshAt,
    section?.next_refresh_at,
    section?.nextStockAt,
    section?.next_stock_at
  );

  if (raw) {
    const date = new Date(raw);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  const remainingMs = firstDefined(
    section?.remainingMs,
    section?.remaining_ms,
    section?.timeLeftMs,
    section?.time_left_ms
  );

  if (Number.isFinite(Number(remainingMs))) {
    return new Date(nowMs + Number(remainingMs)).toISOString();
  }

  return computeAlignedNextRotationAt(nowMs, fallbackHours);
}

function extractSection(payload, keys) {
  for (const key of keys) {
    if (payload?.[key]) {
      return payload[key];
    }
  }

  if (payload?.data) {
    return extractSection(payload.data, keys);
  }

  return null;
}

function normalizeFruitItem(item, resolver) {
  const name = String(
    firstDefined(item?.name, item?.fruit, item?.title, item?.fruitName, item?.item_name, "Unknown")
  ).trim();
  const catalogEntry = resolver.resolve(name);
  const image = firstDefined(item?.image, item?.icon, item?.img, null);

  return {
    key: catalogEntry?.key || name.toLowerCase(),
    name: catalogEntry?.name || name,
    namePt: catalogEntry?.namePt || name,
    image: image
      ? String(image).startsWith("http")
        ? image
        : `https://fruityblox.com${image}`
      : null,
    rarity: firstDefined(item?.rarity, catalogEntry?.rarity, "Desconhecida"),
    type: firstDefined(item?.type, catalogEntry?.type, "Desconhecido"),
    roles: catalogEntry?.roles || [],
    description: firstDefined(item?.description, catalogEntry?.description, "Sem descricao detalhada."),
    beliPrice: firstDefined(item?.priceBeli, item?.beliPrice, item?.price, catalogEntry?.beliPrice, null),
    permRobuxPrice: firstDefined(item?.permRobuxPrice, item?.priceRobux, item?.robuxPrice, catalogEntry?.permRobuxPrice, null),
    lastSeenAt: firstDefined(item?.lastSeenAt, item?.last_seen_at, item?.lastSeen, null),
    inStock: Boolean(firstDefined(item?.inStock, true)),
    value: firstDefined(item?.value, catalogEntry?.value, null)
  };
}

function buildHash(stock) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(stock.map((fruit) => fruit.key).sort()))
    .digest("hex");
}

function buildFallbackFruitImage(fruit) {
  const imageKey = String(fruit?.key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (!imageKey) {
    return null;
  }

  return `https://fruityblox.com/images/fruits/${imageKey}.webp`;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function findStockPayload(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (
    value.normal
    || value.mirage
    || value.normalStock
    || value.mirageStock
    || value.stock
    || value.dealer
    || value.mirageDealer
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStockPayload(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  for (const item of Object.values(value)) {
    const found = findStockPayload(item);

    if (found) {
      return found;
    }
  }

  return null;
}

function parseComponentPayload(text) {
  const trimmed = String(text || "").trim();

  if (!trimmed) {
    throw new Error("Resposta vazia do stock.");
  }

  const direct = tryParseJson(trimmed);
  const directFound = findStockPayload(direct);

  if (directFound) {
    return directFound;
  }

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const candidate = /^\d+:/.test(line) ? line.replace(/^\d+:/, "") : line;
    const parsed = tryParseJson(candidate);
    const found = findStockPayload(parsed);

    if (found) {
      return found;
    }
  }

  const jsonMatches = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/g) || [];

  for (const match of jsonMatches) {
    const parsed = tryParseJson(match);
    const found = findStockPayload(parsed);

    if (found) {
      return found;
    }
  }

  throw new Error("Formato text/x-component do stock nao reconhecido.");
}

export class BloxFruitsService {
  constructor({ database, resolver, logger, timeZone = "America/Bahia", fetchImpl = fetch }) {
    this.database = database;
    this.resolver = resolver;
    this.logger = logger;
    this.timeZone = timeZone;
    this.fetchImpl = fetchImpl;
    this.snapshot = null;
    this.cachedTime = null;
  }

  getSnapshot() {
    if (!this.snapshot) {
      return null;
    }

    const nowMs = this.estimateTrustedNowMs();

    return {
      ...this.snapshot,
      normal: {
        ...this.snapshot.normal,
        remainingMs: Math.max(0, new Date(this.snapshot.normal.nextRotationAt).getTime() - nowMs)
      },
      mirage: {
        ...this.snapshot.mirage,
        remainingMs: Math.max(0, new Date(this.snapshot.mirage.nextRotationAt).getTime() - nowMs)
      }
    };
  }

  estimateTrustedNowMs() {
    if (!this.cachedTime) {
      return Date.now();
    }

    return Date.now() + (this.cachedTime.offsetMs || 0);
  }

  async fetchStockPayload() {
    const requestOptions = {
      method: "POST",
      headers: STOCK_REQUEST_HEADERS,
      body: "{}"
    };

    try {
      const response = await this.fetchImpl(STOCK_SOURCE_URL, requestOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        return response.json();
      }

      const text = await response.text();
      return parseComponentPayload(text);
    } catch (error) {
      this.logger.warn("stock", `Falha ao consultar ${STOCK_SOURCE_URL}: ${error.message}`);
      throw error;
    }
  }

  async fetchTrustedNowMs() {
    const cachedAt = this.cachedTime?.fetchedAt || 0;

    if (this.cachedTime && Date.now() - cachedAt < TIME_API_TTL_MS) {
      return this.cachedTime.nowMs;
    }

    for (const buildUrl of TIME_API_ENDPOINTS) {
      try {
        const response = await this.fetchImpl(buildUrl(this.timeZone), {
          headers: {
            accept: "application/json",
            "user-agent": "NexusNex/1.0"
          }
        });

        if (!response.ok) {
          continue;
        }

        const payload = await response.json();
        const nowMs = this.parseTimeApiPayload(payload);

        if (Number.isFinite(nowMs)) {
          this.cachedTime = {
            nowMs,
            fetchedAt: Date.now(),
            offsetMs: nowMs - Date.now()
          };
          return nowMs;
        }
      } catch {
        continue;
      }
    }

    const fallback = Date.now();
    this.cachedTime = {
      nowMs: fallback,
      fetchedAt: Date.now(),
      offsetMs: 0
    };
    return fallback;
  }

  parseTimeApiPayload(payload) {
    const candidates = [
      payload?.unixtime ? Number(payload.unixtime) * 1000 : null,
      payload?.datetime ? new Date(payload.datetime).getTime() : null,
      payload?.dateTime ? new Date(payload.dateTime).getTime() : null,
      payload?.currentLocalTime ? new Date(payload.currentLocalTime).getTime() : null
    ];

    return candidates.find((value) => Number.isFinite(value)) ?? null;
  }

  normalizeSnapshot(payload, nowMs) {
    const normalSection = extractSection(payload, ["normal", "normalStock", "stock", "dealer"]);
    const mirageSection = extractSection(payload, ["mirage", "mirageStock", "mirageDealer"]);

    if (!normalSection && !mirageSection) {
      throw new Error("Formato de stock nao reconhecido.");
    }

    const normalNextRotationAt = parseNextRotationAt(normalSection || {}, 4, nowMs);
    const mirageNextRotationAt = parseNextRotationAt(mirageSection || {}, 2, nowMs);

    const normalFruits = asArray(normalSection).map((item) => normalizeFruitItem(item, this.resolver));
    const mirageFruits = asArray(mirageSection).map((item) => normalizeFruitItem(item, this.resolver));

    return {
      fetchedAt: new Date(nowMs).toISOString(),
      normal: {
        fruits: normalFruits,
        nextRotationAt: normalNextRotationAt,
        remainingMs: parseRemainingMs(normalSection || {}, normalNextRotationAt, nowMs),
        hash: buildHash(normalFruits)
      },
      mirage: {
        fruits: mirageFruits,
        nextRotationAt: mirageNextRotationAt,
        remainingMs: parseRemainingMs(mirageSection || {}, mirageNextRotationAt, nowMs),
        hash: buildHash(mirageFruits)
      }
    };
  }

  async refreshStock({ trigger = "manual" } = {}) {
    const previous = this.snapshot;
    let payload;

    try {
      payload = await this.fetchStockPayload();
    } catch (error) {
      if (previous) {
        this.logger.warn("stock", "Usando snapshot em cache por falha temporaria na origem.");
        return {
          snapshot: previous,
          previous,
          changed: {
            normal: false,
            mirage: false
          },
          runtime: this.database.getRuntimeConfig(),
          trigger,
          isInitialSync: false,
          degraded: true
        };
      }

      throw error;
    }

    const trustedNowMs = await this.fetchTrustedNowMs();
    const snapshot = this.normalizeSnapshot(payload, trustedNowMs);
    this.snapshot = snapshot;
    const runtime = this.database.getRuntimeConfig();

    const isInitialSync = !previous;
    const previousNormalHash = previous?.normal?.hash || runtime?.stockState?.normalHash || null;
    const previousMirageHash = previous?.mirage?.hash || runtime?.stockState?.mirageHash || null;
    const normalChanged = previousNormalHash !== snapshot.normal.hash;
    const mirageChanged = previousMirageHash !== snapshot.mirage.hash;
    const changedDealers = {
      normal: normalChanged ? snapshot.normal : null,
      mirage: mirageChanged ? snapshot.mirage : null
    };

    await this.database.updateRuntimeConfig({
      scheduler: {
        lastCheckAt: snapshot.fetchedAt,
        nextCheckAt: this.getNextCheckAt(snapshot)
      },
      stockState: {
        normalHash: snapshot.normal.hash,
        mirageHash: snapshot.mirage.hash,
        lastStockAt: snapshot.fetchedAt
      }
    });

    if (normalChanged && snapshot.normal.fruits.length) {
      await this.database.recordHistory({
        dealerType: "normal",
        fruits: snapshot.normal.fruits,
        detectedAt: snapshot.fetchedAt
      });
    }

    if (mirageChanged && snapshot.mirage.fruits.length) {
      await this.database.recordHistory({
        dealerType: "mirage",
        fruits: snapshot.mirage.fruits,
        detectedAt: snapshot.fetchedAt
      });
    }

    this.logger.info("stock", `Stock atualizado via ${trigger} em ${formatDateTime(snapshot.fetchedAt)}.`);

    return {
      snapshot,
      previous,
      changed: {
        normal: normalChanged,
        mirage: mirageChanged
      },
      changedDealers,
      runtime,
      trigger,
      isInitialSync,
      degraded: false
    };
  }

  getNextCheckAt(snapshot = this.snapshot) {
    if (!snapshot) {
      return new Date(Date.now() + FALLBACK_STOCK_RETRY_MS).toISOString();
    }

    const candidates = [snapshot.normal.nextRotationAt, snapshot.mirage.nextRotationAt]
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);

    if (!candidates.length) {
      return new Date(Date.now() + FALLBACK_STOCK_RETRY_MS).toISOString();
    }

    return new Date(candidates[0]).toISOString();
  }

  resolveFruit(query) {
    const catalogEntry = this.resolver.resolve(query);

    if (!catalogEntry) {
      return null;
    }

    const liveNormal = this.snapshot?.normal?.fruits?.find((fruit) => fruit.key === catalogEntry.key) || null;
    const liveMirage = this.snapshot?.mirage?.fruits?.find((fruit) => fruit.key === catalogEntry.key) || null;
    const appearances = this.database.findHistoryByFruit(catalogEntry.key);
    const currentLiveData = liveNormal || liveMirage || null;

    return {
      ...catalogEntry,
      image: currentLiveData?.image || catalogEntry.image || buildFallbackFruitImage(catalogEntry),
      beliPrice: currentLiveData?.beliPrice ?? catalogEntry.beliPrice ?? null,
      permRobuxPrice: currentLiveData?.permRobuxPrice ?? catalogEntry.permRobuxPrice ?? null,
      type: currentLiveData?.type || catalogEntry.type,
      currentlyInNormalStock: Boolean(liveNormal),
      currentlyInMirageStock: Boolean(liveMirage),
      lastSeenAt: appearances[0]?.detectedAt || liveNormal?.lastSeenAt || liveMirage?.lastSeenAt || null,
      currentLiveData
    };
  }
}
