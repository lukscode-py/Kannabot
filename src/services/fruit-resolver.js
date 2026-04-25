import { FRUIT_CATALOG } from "../database/fruit-catalog.js";
import { normalizeFruitKey } from "../utils/normalize.js";

function buildIndex() {
  const index = new Map();

  for (const fruit of FRUIT_CATALOG) {
    const keys = [fruit.key, fruit.name, fruit.namePt, ...(fruit.aliases || [])];

    for (const key of keys) {
      index.set(normalizeFruitKey(key), fruit);
    }
  }

  return index;
}

export class FruitResolver {
  constructor() {
    this.index = buildIndex();
    this.catalog = FRUIT_CATALOG;
  }

  resolve(query) {
    const normalized = normalizeFruitKey(query);

    if (!normalized) {
      return null;
    }

    if (this.index.has(normalized)) {
      return this.index.get(normalized);
    }

    return this.catalog.find((fruit) => {
      const haystack = [fruit.key, fruit.name, fruit.namePt, ...(fruit.aliases || [])]
        .map((item) => normalizeFruitKey(item));

      return haystack.some((item) => item.includes(normalized) || normalized.includes(item));
    }) || null;
  }
}
