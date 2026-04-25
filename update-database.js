import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, "database", "bloxfruits");
const IMAGE_DIR = path.join(DATA_DIR, "images");
const WIKI_API = "https://blox-fruits.fandom.com/api.php";
const FRUITYBLOX_STOCK_URL = "https://fruityblox.com/stock";
const FRUITYBLOX_STOCK_PAGE = "https://fruityblox.com/stock";
const WIKI_BLOX_FRUITS_PAGE = "https://blox-fruits.fandom.com/wiki/Blox_Fruits";
const WIKI_ROCKET_PAGE = "https://blox-fruits.fandom.com/wiki/Rocket";
const USER_AGENT = "NexusNex-DataBuilder/1.0";

const FRUITYBLOX_HEADERS = {
  accept: "text/x-component",
  "accept-language": "en-US,en;q=0.9,pt-BR;q=0.8",
  "content-type": "text/plain;charset=UTF-8",
  origin: "https://fruityblox.com",
  referer: "https://fruityblox.com/stock",
  "next-action": "000e834c372ac1b9cdffe4f36d95a76c33c66cbd36",
  "next-router-state-tree": "[\"\",{\"children\":[\"stock\",{\"children\":[\"__PAGE__\",{},null,null]},null,null]},null,null,true]",
  "user-agent": USER_AGENT,
  cookie: "popupDismissed=true",
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  "sec-ch-ua": "\"Chromium\";v=\"126\", \"Not-A.Brand\";v=\"24\", \"Opera\";v=\"112\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"Linux\""
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripTags(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#10004;/g, "true")
    .replace(/&#10008;/g, "false")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function decodeWikiTitle(value) {
  return decodeURIComponent(String(value || "").replace(/_/g, " "));
}

function parseMoney(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function absoluteWikiUrl(title) {
  return `https://blox-fruits.fandom.com/wiki/${encodeURIComponent(String(title || "").replace(/ /g, "_"))}`;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseFruityBloxPayload(text) {
  const lines = String(text || "")
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const candidate = line.replace(/^\d+:/, "");
    const parsed = tryParseJson(candidate);

    if (parsed?.normal || parsed?.mirage) {
      return parsed;
    }
  }

  throw new Error("Nao foi possivel interpretar o payload de stock da FruityBlox.");
}

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Falha em ${url}: HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Falha em ${url}: HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchWikiPage(title, prop = "text") {
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=${prop}&formatversion=2&format=json`;
  return fetchJson(url, {
    headers: {
      "user-agent": USER_AGENT
    }
  });
}

function extractCurrentFruitTitles(rocketHtml) {
  const matches = [...rocketHtml.matchAll(/<a href="\/wiki\/([^"]+)" title="([^"]+)"><img alt="[^"]+ Fruit"/g)];
  const titles = unique(matches.map((match) => decodeWikiTitle(match[2])));
  return titles;
}

function extractInfoboxHtml(html) {
  const match = html.match(/<aside[\s\S]*?<\/aside>/i);
  return match?.[0] || html;
}

function extractIntroHtml(html) {
  const withoutInfobox = html.replace(/<aside[\s\S]*?<\/aside>/i, "");
  const match = withoutInfobox.match(/^[\s\S]*?(?=<h2|<table class="bfw-navbox|<!--)/i);
  return match?.[0] || withoutInfobox;
}

function extractField(html, dataSource) {
  const pattern = new RegExp(`data-source="${dataSource}"[\\s\\S]*?<div class="[^"]*pi-data-value[^"]*">([\\s\\S]*?)<\\/div>`, "i");
  const match = html.match(pattern);
  return match ? stripTags(match[1]) : null;
}

function extractGroupField(html, dataSource) {
  const pattern = new RegExp(`class="[^"]*pi-data-value[^"]*"[^>]*data-source="${dataSource}"[^>]*>([\\s\\S]*?)<\\/t[dh]>`, "i");
  const match = html.match(pattern);
  return match ? stripTags(match[1]) : null;
}

function extractReleaseDate(html) {
  const dateText = extractField(html, "update");
  const linkMatch = html.match(/data-source="update"[\s\S]*?<a href="([^"]+)" title="([^"]+)"/i);

  return {
    release_date: dateText,
    release_update: linkMatch?.[2] || null,
    release_update_url: linkMatch?.[1] ? `https://blox-fruits.fandom.com${linkMatch[1]}` : null
  };
}

function extractFruitIconUrl(html) {
  const urls = unique(
    [...html.matchAll(/https:\/\/static\.wikia\.nocookie\.net\/roblox-blox-piece\/images\/[^"]+/g)]
      .map((match) => match[0].replace(/&amp;/g, "&"))
  );

  const preferred = urls.find((url) => !/\.gif/i.test(url) && /Fruit|fruit/i.test(url));
  return preferred || urls.find((url) => /Fruit|fruit/i.test(url)) || urls[0] || null;
}

function extractShopDescription(html) {
  const match = html.match(/<center><i>([\s\S]*?)<\/i><\/center>/i);
  return match ? stripTags(match[1]) : null;
}

function extractFormerNames(html) {
  const matches = [...html.matchAll(/formerly known as <a href="\/wiki\/([^"]+)" title="([^"]+)"/gi)];
  return unique(matches.flatMap((match) => [decodeWikiTitle(match[1]), decodeWikiTitle(match[2])]));
}

function detectAwakening(infoboxHtml) {
  if (/Awakening|Awakened|Upgrading/i.test(infoboxHtml)) {
    return true;
  }

  return null;
}

function extractObtainMethods(introHtml) {
  const methods = [];

  if (/from the <a href="\/wiki\/Blox_Fruit_Dealer"/i.test(introHtml)) {
    methods.push("Blox Fruit Dealer");
  }

  if (/Trading/i.test(introHtml)) {
    methods.push("Trading");
  }

  if (/Dog House \(Wenlock\)|Wenlock/i.test(introHtml)) {
    methods.push("Dog House (Wenlock)");
  }

  if (/Tyrant of the Skies/i.test(introHtml)) {
    methods.push("Tyrant of the Skies");
  }

  if (/Azure Ember/i.test(introHtml)) {
    methods.push("Azure Ember");
  }

  if (/Dragon Egg/i.test(introHtml)) {
    methods.push("Dragon Egg");
  }

  return unique(methods);
}

function mapStockItems(items, dealerType) {
  return items.map((item) => ({
    dealer_type: dealerType,
    name: item.name ?? null,
    slug: slugify(item.name),
    type: item.type ?? null,
    price_beli: Number.isFinite(Number(item.price)) ? Number(item.price) : null,
    price_robux: Number.isFinite(Number(item.robuxPrice)) ? Number(item.robuxPrice) : null,
    image_url: item.image ? `https://fruityblox.com${item.image}` : null,
    source_url: FRUITYBLOX_STOCK_PAGE
  }));
}

async function downloadImage(url, filePath) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem ${url}: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, buffer);
}

async function buildDatabase() {
  await ensureDir(DATA_DIR);
  await ensureDir(IMAGE_DIR);

  const sourcesUsed = new Set([
    WIKI_BLOX_FRUITS_PAGE,
    WIKI_ROCKET_PAGE,
    FRUITYBLOX_STOCK_PAGE
  ]);

  const rocketPage = await fetchWikiPage("Rocket", "text");
  const rocketHtml = rocketPage.parse.text;
  const fruitTitles = extractCurrentFruitTitles(rocketHtml);

  if (!fruitTitles.length) {
    throw new Error("Nenhuma fruta atual foi extraida da wiki.");
  }

  const overallPage = await fetchWikiPage("Blox Fruits", "wikitext");
  const overallWikitext = overallPage.parse.wikitext;
  const spawnWeeklyMatch = overallWikitext.match(/spawn hourly, or every 45 minutes during weekends/i);
  const genericObtainMethods = [
    "Blox Fruit Dealer",
    "Blox Fruit Gacha",
    "Trading",
    "Trees",
    "Sea Events"
  ];

  const stockRaw = await fetchText(FRUITYBLOX_STOCK_URL, {
    method: "POST",
    headers: FRUITYBLOX_HEADERS,
    body: "{}"
  });
  const stockPayload = parseFruityBloxPayload(stockRaw);

  const stock = {
    generated_from: "live public stock payload",
    fetched_at: new Date().toISOString(),
    source_url: FRUITYBLOX_STOCK_PAGE,
    normal: mapStockItems(stockPayload.normal || [], "normal"),
    mirage: mapStockItems(stockPayload.mirage || [], "mirage")
  };

  const liveStockBySlug = new Map();

  for (const item of [...stock.normal, ...stock.mirage]) {
    if (!liveStockBySlug.has(item.slug)) {
      liveStockBySlug.set(item.slug, item);
    }
  }

  const fruits = [];
  const images = [];
  const prices = [];
  const wikiData = [];
  const aliases = [];
  const updates = [];

  for (const title of fruitTitles) {
    const page = await fetchWikiPage(title, "text");
    const html = page.parse.text;
    const infoboxHtml = extractInfoboxHtml(html);
    const introHtml = extractIntroHtml(html);
    const slug = slugify(title);
    const liveStock = liveStockBySlug.get(slug) || null;

    const type = extractGroupField(infoboxHtml, "type");
    const rarity = extractGroupField(infoboxHtml, "rarity");
    const priceBeli = parseMoney(extractGroupField(infoboxHtml, "money"));
    const priceRobux = parseMoney(extractGroupField(infoboxHtml, "robux"));
    const imageUrl = extractFruitIconUrl(infoboxHtml);
    const shopDescription = extractShopDescription(introHtml);
    const formerNames = extractFormerNames(introHtml);
    const release = extractReleaseDate(infoboxHtml);
    const obtainMethods = extractObtainMethods(introHtml);
    const awakenable = detectAwakening(infoboxHtml);
    const pageUrl = absoluteWikiUrl(title);

    sourcesUsed.add(pageUrl);

    const sourceUrls = unique([
      pageUrl,
      liveStock ? FRUITYBLOX_STOCK_PAGE : null
    ]);

    fruits.push({
      name: title,
      slug,
      name_pt: null,
      type: type || liveStock?.type || null,
      rarity: rarity || null,
      price_beli: priceBeli ?? liveStock?.price_beli ?? null,
      price_robux: priceRobux ?? liveStock?.price_robux ?? null,
      obtain_methods: obtainMethods.length ? obtainMethods : null,
      awakenable,
      release_date: release.release_date,
      release_update: release.release_update,
      release_update_url: release.release_update_url,
      source_urls: sourceUrls
    });

    wikiData.push({
      fruit: title,
      slug,
      wiki_page_id: page.parse.pageid,
      wiki_page_title: page.parse.title,
      wiki_page_url: pageUrl,
      shop_description: shopDescription,
      type: type || null,
      rarity: rarity || null,
      release_date: release.release_date,
      release_update: release.release_update,
      release_update_url: release.release_update_url,
      source_url: pageUrl
    });

    prices.push({
      fruit: title,
      slug,
      price_beli: priceBeli ?? liveStock?.price_beli ?? null,
      price_robux: priceRobux ?? liveStock?.price_robux ?? null,
      source_urls: sourceUrls
    });

    updates.push({
      fruit: title,
      slug,
      release_date: release.release_date,
      release_update: release.release_update,
      release_update_url: release.release_update_url,
      source_url: pageUrl
    });

    for (const alias of formerNames) {
      aliases.push({
        fruit: title,
        slug,
        alias,
        alias_slug: slugify(alias),
        relation: "former_name",
        source_url: pageUrl
      });
    }

    if (imageUrl) {
      const extension = path.extname(new URL(imageUrl).pathname) || ".png";
      const imageFile = `${slug}${extension}`;
      const imagePath = path.join(IMAGE_DIR, imageFile);

      await downloadImage(imageUrl, imagePath);
      images.push({
        fruit: title,
        slug,
        image_file: path.join("images", imageFile).replace(/\\/g, "/"),
        source_url: imageUrl,
        source_page_url: pageUrl
      });
      sourcesUsed.add(imageUrl);
    }
  }

  const spawnData = {
    fruit_spawns: [
      {
        rule: spawnWeeklyMatch ? "Fruits spawn hourly, or every 45 minutes during weekends." : null,
        source_url: WIKI_BLOX_FRUITS_PAGE
      }
    ]
  };

  const dealerData = {
    dealers: [
      {
        name: "Blox Fruit Dealer",
        stock_rotation_hours: 4,
        stock_source: "FruityBlox stock page states normal stock updates every 4 hours.",
        source_url: FRUITYBLOX_STOCK_PAGE
      },
      {
        name: "Mirage Fruit Dealer",
        stock_rotation_hours: 2,
        stock_source: "FruityBlox stock page states Mirage stock updates every 2 hours.",
        source_url: FRUITYBLOX_STOCK_PAGE
      }
    ]
  };

  const metadata = {
    generated_at: new Date().toISOString(),
    sources_used: [...sourcesUsed].sort(),
    total_fruits: fruits.length,
    images_downloaded: images.length
  };

  await writeJson(path.join(DATA_DIR, "fruits.json"), fruits);
  await writeJson(path.join(DATA_DIR, "images.json"), images);
  await writeJson(path.join(DATA_DIR, "prices.json"), prices);
  await writeJson(path.join(DATA_DIR, "stock.json"), stock);
  await writeJson(path.join(DATA_DIR, "spawn-data.json"), spawnData);
  await writeJson(path.join(DATA_DIR, "dealer-data.json"), dealerData);
  await writeJson(path.join(DATA_DIR, "wiki-data.json"), wikiData);
  await writeJson(path.join(DATA_DIR, "aliases.json"), aliases);
  await writeJson(path.join(DATA_DIR, "updates.json"), updates);
  await writeJson(path.join(DATA_DIR, "metadata.json"), metadata);

  console.log(`Base Blox Fruits atualizada com ${fruits.length} frutas e ${images.length} imagens.`);
  console.log(`Arquivos gerados em ${DATA_DIR}`);
}

buildDatabase().catch((error) => {
  console.error(error);
  process.exit(1);
});
