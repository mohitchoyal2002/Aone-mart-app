import { createHash } from "node:crypto";
import { row, run } from "./db.js";
import { DatabaseRateStore } from "./rate-store.js";
import { normalizeBarcode } from "./barcodes.js";
import { selectBarcodePhoto, type VerifiedPhoto } from "./product-photos.js";

type Item = Record<string, any>;
type Attempt = { retryAt: number; completed: boolean };
const DAY = 86400000;
const genericWords = new Set(
  "premium fresh red green garden whole wheat chocolate cookies basmati rice sunflower cooking oil toned milk bread tea gentle bathing soap atta flour moong chana masala punjabi special papad salt sugar dal agarbatti classic original organic pack".split(
    " ",
  ),
);
const sources = ["quickpantry", "food-name", "upc-name"];
const inFlight = new Map<string, Promise<void>>();
const agent =
  "AoneMart/1.2.2 (https://github.com/mohitchoyal2002/Aone-mart-app)";
const food = { id: "food", name: "Open Food Facts", host: "openfoodfacts.org" };

export function photoIdentity(p: Item): string {
  return createHash("sha256")
    .update(
      JSON.stringify([p.name, p.unit || "", p.sku || "", p.barcode || ""]),
    )
    .digest("hex");
}
function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/(\d)\s*star\b/g, "$1 star")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/\b(?:gms?|grams?)\b/g, "g")
    .replace(/\b(?:litres?|liters?)\b/g, "l")
    .replace(/\b(?:kgs?|kilograms?)\b/g, "kg")
    .replace(/\b(?:millilitres?|milliliters?)\b/g, "ml")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}
function quantities(value: unknown) {
  return [
    ...normalize(value).matchAll(/\b(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/g),
  ].map(
    (m) =>
      `${+m[1] * (m[2] === "kg" || m[2] === "l" ? 1000 : 1)}${m[2] === "ml" || m[2] === "l" ? "ml" : "g"}`,
  );
}
function words(value: unknown) {
  return normalize(value)
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l|mrp)\b/g, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        t &&
        !["pack", "pcs", "pc", "unit", "units", "of", "gm", "mrp"].includes(t),
    );
}
export function namePhotoMatches(p: Item, candidate: Item): boolean {
  const required = words(p.name);
  // Short/generic names cannot identify a brand and product variant reliably.
  if (required.length < 2 || required.every((t) => genericWords.has(t)))
    return false;
  const title = String(
    candidate.title ||
      candidate.product_name ||
      candidate.product_name_en ||
      "",
  );
  const actual = words(
    `${candidate.brand || candidate.brands || candidate.vendor || ""} ${title}`,
  );
  if (!required.every((t) => actual.includes(t))) return false;
  const wantedSizes = quantities(`${p.name} ${p.unit || ""}`);
  const actualSizes = quantities(`${title} ${candidate.quantity || ""}`);
  if (
    wantedSizes.length &&
    (!actualSizes.length ||
      wantedSizes.some((v) => !actualSizes.includes(v)) ||
      actualSizes.some((v) => !wantedSizes.includes(v)))
  )
    return false;
  // Do not silently substitute a multipack or a differently flavoured variant.
  if (
    /\b(?:pack of|multipack|combo)\b|\b\d+\s*[x×]\s*\d/i.test(title) &&
    !/\b(?:pack of|multipack|combo)\b|\b\d+\s*[x×]\s*\d/i.test(p.name)
  )
    return false;
  const variants = [
    "special",
    "punjabi",
    "masala",
    "chatpata",
    "chana",
    "moong",
    "penne",
    "fusilli",
    "oreo",
    "original",
    "classic",
    "sugarfree",
    "dark",
    "milk",
    "white",
    "rose",
    "sandal",
    "lavender",
    "chandan",
    "salted",
    "unsalted",
    "premium",
  ];
  if (variants.some((v) => actual.includes(v) && !required.includes(v)))
    return false;
  const mrp = normalize(p.name).match(/\b(\d+(?:\.\d+)?)\s*mrp\b/);
  if (mrp && (!candidate.mrp || Number(candidate.mrp) !== Number(mrp[1])))
    return false;
  return true;
}
function publicImage(value: unknown, host?: string): string {
  try {
    const u = new URL(String(value));
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      !u.hostname.includes(".") ||
      /^(?:\d+\.|\[)|(?:localhost|\.local|\.internal)$/.test(u.hostname)
    )
      return "";
    if (host && u.hostname !== host) return "";
    return u.href;
  } catch {
    return "";
  }
}
export function selectNamePhoto(
  p: Item,
  candidates: Item[],
  source: string,
): VerifiedPhoto | undefined {
  const matches = candidates.filter((c) => namePhotoMatches(p, c));
  // Multiple pack sizes / brands with the same short name need manual mapping.
  const identities = new Set(
    matches.map((c) =>
      normalize(
        `${c.brand || c.brands || c.vendor || ""} ${c.title || c.product_name || c.product_name_en || ""} ${c.quantity || ""}`,
      ),
    ),
  );
  if (identities.size !== 1) return;
  for (const c of matches) {
    if (source === "food-name") {
      const photo = selectBarcodePhoto(normalizeBarcode(c.code), c, food);
      if (photo)
        return {
          ...photo,
          imageSource: { ...photo.imageSource, matchMethod: "name" },
        };
    } else {
      const image = publicImage(
        source === "quickpantry" ? c.image : c.images?.[0],
        source === "quickpantry" ? "cdn.shopify.com" : undefined,
      );
      if (!image) continue;
      const path = String(c.handle || "");
      if (source === "quickpantry" && !/^[a-z0-9-]+$/.test(path)) continue;
      const code = [c.ean, c.upc, c.gtin].find((v) => normalizeBarcode(v));
      if (source === "upc-name" && !code) continue;
      return {
        imageUrl: image,
        imageThumbnailUrl: image,
        imageSource: {
          provider: source === "quickpantry" ? "Quick Pantry" : "UPCitemdb",
          url:
            source === "quickpantry"
              ? `https://www.quickpantry.in/products/${path}`
              : `https://www.upcitemdb.com/upc/${code}`,
          license: "Source image rights apply",
          barcode: normalizeBarcode(code),
          productName: String(c.title),
          matchMethod: "name",
        },
      };
    }
  }
}
async function budget(source: string, limit: number, windowMs = 60000) {
  const store = new DatabaseRateStore("product-photos:");
  store.windowMs = windowMs;
  return (await store.increment(source)).totalHits <= limit;
}
async function search(p: Item, source: string): Promise<Item[] | undefined> {
  const query = words(p.name).join(" ");
  let url: URL;
  if (source === "quickpantry") {
    if (!(await budget("quickpantry:search", 24))) return;
    url = new URL("https://www.quickpantry.in/search/suggest.json");
    url.searchParams.set("q", query);
    url.searchParams.set("resources[type]", "product");
    url.searchParams.set("resources[limit]", "10");
  } else if (source === "food-name") {
    if (!(await budget("food:name", 2))) return;
    url = new URL("https://search.openfoodfacts.org/search");
    url.searchParams.set(
      "q",
      words(p.name)
        .map((t) => `\"${t}\"`)
        .join(" AND "),
    );
    url.searchParams.set(
      "fields",
      "code,product_name,product_name_en,brands,quantity,image_front_url,images,lang,lc",
    );
    url.searchParams.set("page_size", "20");
  } else {
    if (
      !(await budget("upcitemdb:burst", 1, 10000)) ||
      !(await budget("upcitemdb:day", 90, DAY))
    )
      return;
    url = new URL("https://api.upcitemdb.com/prod/trial/search");
    url.searchParams.set("s", query);
  }
  const r = await fetch(url, {
    headers: { "User-Agent": agent, Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
    redirect: "error",
  });
  if (!r.ok) throw new Error("Product photo search unavailable");
  const data = (await r.json()) as Item;
  const candidates =
    source === "quickpantry"
      ? data.resources?.results?.products
      : source === "food-name"
        ? data.hits
        : data.items;
  if (!Array.isArray(candidates))
    throw new Error("Invalid product photo search response");
  return candidates.map((c) =>
    source === "quickpantry" ? { ...c, mrp: c.compare_at_price_max } : c,
  );
}
async function lookup(p: Item, identity: string) {
  const cached = await row(
    "SELECT * FROM product_name_photos WHERE product_id=? AND identity=?",
    p.id,
    identity,
  );
  if (cached?.image_url || cached?.retry_at > Date.now()) return;
  const attempts: Record<string, Attempt> = cached?.attempts_json
    ? JSON.parse(cached.attempts_json)
    : {};
  let photo: VerifiedPhoto | undefined;
  for (const source of sources) {
    if (attempts[source]?.retryAt > Date.now()) continue;
    try {
      const candidates = await search(p, source);
      if (!candidates) continue;
      photo = selectNamePhoto(p, candidates, source);
      attempts[source] = { retryAt: Date.now() + 7 * DAY, completed: true };
      if (photo) break;
    } catch {
      attempts[source] = { retryAt: Date.now() + 10 * 60000, completed: false };
    }
  }
  const complete = sources.every(
    (s) => attempts[s]?.completed && attempts[s].retryAt > Date.now(),
  );
  const retryAt = photo
    ? 0
    : complete
      ? Date.now() + 7 * DAY
      : Math.max(
          Date.now() + 60000,
          Math.min(
            ...sources.map((s) => attempts[s]?.retryAt || Date.now() + 60000),
          ),
        );
  await run(
    `INSERT INTO product_name_photos(product_id,identity,name,unit,sku,barcode,image_url,thumbnail_url,source_json,attempts_json,retry_at,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET identity=excluded.identity,name=excluded.name,unit=excluded.unit,sku=excluded.sku,barcode=excluded.barcode,image_url=excluded.image_url,thumbnail_url=excluded.thumbnail_url,source_json=excluded.source_json,attempts_json=excluded.attempts_json,retry_at=excluded.retry_at,status=excluded.status`,
    p.id,
    identity,
    p.name,
    p.unit || "",
    p.sku || "",
    p.barcode || "",
    photo?.imageUrl || "",
    photo?.imageThumbnailUrl || "",
    photo ? JSON.stringify(photo.imageSource) : "",
    JSON.stringify(attempts),
    retryAt,
    photo ? "matched" : complete ? "unavailable" : "pending",
  );
}
export async function resolveNamePhotos(products: Item[]) {
  // Limit work on an individual request; other visible items retry independently.
  const pending = products.filter(
    (p) => !p.image_url && words(p.name).length >= 2,
  );
  let started = 0;
  const results = await Promise.all(
    pending.map(async (p) => {
      const identity = photoIdentity(p);
      let cached = await row(
        "SELECT * FROM product_name_photos WHERE product_id=? AND identity=?",
        p.id,
        identity,
      );
      if (
        !cached?.image_url &&
        !(cached?.retry_at > Date.now()) &&
        started++ < 6
      ) {
        let work = inFlight.get(identity + p.id);
        if (!work) {
          work = lookup(p, identity).finally(() =>
            inFlight.delete(identity + p.id),
          );
          inFlight.set(identity + p.id, work);
        }
        await work;
        cached = await row(
          "SELECT * FROM product_name_photos WHERE product_id=? AND identity=?",
          p.id,
          identity,
        );
      }
      return {
        id: p.id,
        status: cached?.status || "pending",
        imageUrl: cached?.image_url || "",
        imageThumbnailUrl: cached?.thumbnail_url || "",
        imageSource: cached?.source_json
          ? JSON.parse(cached.source_json)
          : null,
        retryAfter:
          cached?.status === "matched" || cached?.status === "unavailable"
            ? 0
            : Math.max(
                60,
                Math.ceil(
                  ((cached?.retry_at || Date.now()) - Date.now()) / 1000,
                ),
              ),
      };
    }),
  );
  return results;
}
