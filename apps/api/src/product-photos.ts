import { row, rows, run } from "./db.js";
import { DatabaseRateStore } from "./rate-store.js";
import { normalizeBarcode, barcodeAliases } from "./barcodes.js";

export type PhotoSource = {
  provider: string;
  url: string;
  license: string;
  barcode: string;
  productName: string;
};
export type VerifiedPhoto = {
  imageUrl: string;
  imageThumbnailUrl: string;
  imageSource: PhotoSource;
};
type Item = Record<string, any>;
const DAY = 86400000;
const providers = [
  { id: "food", name: "Open Food Facts", host: "openfoodfacts.org" },
  { id: "beauty", name: "Open Beauty Facts", host: "openbeautyfacts.org" },
  {
    id: "products",
    name: "Open Products Facts",
    host: "openproductsfacts.org",
  },
];
const agent =
  "AoneMart/1.2.1 (https://github.com/mohitchoyal2002/Aone-mart-app)";
const inFlight = new Map<string, Promise<void>>();

function httpsImage(value: unknown, host?: string): string {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!host ||
        url.hostname === `images.${host}` ||
        url.hostname === `world.${host}`)
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function selectBarcodePhoto(
  barcode: string,
  data: Item,
  provider: (typeof providers)[number] | "upcitemdb",
): VerifiedPhoto | undefined {
  if (provider === "upcitemdb") {
    if (
      ![data.ean, data.upc, data.gtin].some(
        (v) => normalizeBarcode(v) === barcode,
      )
    )
      return;
    const image = (Array.isArray(data.images) ? data.images : [])
      .map((v: unknown) => httpsImage(v))
      .find(Boolean);
    if (!image) return;
    return {
      imageUrl: image,
      imageThumbnailUrl: image,
      imageSource: {
        provider: "UPCitemdb",
        url: `https://www.upcitemdb.com/upc/${data.ean || data.upc || data.gtin}`,
        license: "Source image rights apply",
        barcode,
        productName: String(data.title || ""),
      },
    };
  }
  if (normalizeBarcode(data.code) !== barcode) return;
  let front = httpsImage(data.image_front_url, provider.host);
  if (!front && data.images && /^\d{8,14}$/.test(String(data.code))) {
    const keys = [
      "front_en",
      `front_${data.lang || data.lc}`,
      "front",
      ...Object.keys(data.images).filter((k) => /^front_[a-z]{2}$/.test(k)),
    ];
    const selected = keys.find(
      (k) =>
        /^\d+$/.test(String(data.images[k]?.rev)) &&
        data.images[k]?.sizes?.["400"],
    );
    if (selected) {
      const folder = String(data.code)
        .padStart(13, "0")
        .replace(/^(...)(...)(...)(.*)$/, "$1/$2/$3/$4");
      front = `https://images.${provider.host}/images/products/${folder}/${selected}.${data.images[selected].rev}.400.jpg`;
    }
  }
  if (!front) return;
  // The documented selected front image has a full-size version. Keep the
  // returned display image as the safe fallback if that rendition is missing.
  const full = front.replace(/\.(?:100|200|400)\.jpg$/, ".full.jpg");
  return {
    imageUrl: full,
    imageThumbnailUrl: front,
    imageSource: {
      provider: provider.name,
      url: `https://world.${provider.host}/product/${data.code}`,
      license: "CC BY-SA 3.0",
      barcode,
      productName: String(data.product_name || data.product_name_en || ""),
    },
  };
}

async function budget(
  key: string,
  max: number,
  windowMs = 60000,
): Promise<boolean> {
  const store = new DatabaseRateStore("product-photos:");
  store.windowMs = windowMs;
  const result = await store.increment(key);
  return result.totalHits <= max;
}
async function request(url: URL): Promise<Item> {
  const response = await fetch(url, {
    headers: { "User-Agent": agent, Accept: "application/json" },
    signal: AbortSignal.timeout(7000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Photo provider HTTP ${response.status}`);
  return (await response.json()) as Item;
}
async function savePhoto(barcode: string, photo: VerifiedPhoto) {
  await run(
    `INSERT INTO product_image_cache(barcode,image_url,thumbnail_url,source_json,checked_at)
     VALUES(?,?,?,?,?) ON CONFLICT(barcode) DO NOTHING`,
    barcode,
    photo.imageUrl,
    photo.imageThumbnailUrl,
    JSON.stringify(photo.imageSource),
    Date.now(),
  );
}
async function recordAttempt(
  barcode: string,
  provider: string,
  success: boolean,
) {
  await run(
    `INSERT INTO product_image_lookups(barcode,provider,retry_at,completed) VALUES(?,?,?,?)
     ON CONFLICT(barcode,provider) DO UPDATE SET retry_at=excluded.retry_at,completed=excluded.completed`,
    barcode,
    provider,
    Date.now() + (success ? 7 * DAY : 10 * 60000),
    success ? 1 : 0,
  );
}
async function due(barcodes: string[], provider: string): Promise<string[]> {
  const result: string[] = [];
  for (const barcode of barcodes) {
    if (
      await row(
        "SELECT barcode FROM product_image_cache WHERE barcode=?",
        barcode,
      )
    )
      continue;
    const attempt = await row(
      "SELECT retry_at FROM product_image_lookups WHERE barcode=? AND provider=?",
      barcode,
      provider,
    );
    if (!attempt || attempt.retry_at <= Date.now()) result.push(barcode);
  }
  return result;
}
async function lookupBatch(barcodes: string[]) {
  for (const provider of providers) {
    const pending = await due(barcodes, provider.id);
    if (!pending.length || !(await budget(`${provider.id}:search`, 6)))
      continue;
    const food = provider.id === "food";
    const url = new URL(
      food
        ? "https://search.openfoodfacts.org/search"
        : `https://world.${provider.host}/api/v2/search`,
    );
    if (food)
      url.searchParams.set(
        "q",
        `code:(${pending
          .flatMap(barcodeAliases)
          .map((b) => `\"${b}\"`)
          .join(" OR ")})`,
      );
    else
      url.searchParams.set("code", pending.flatMap(barcodeAliases).join(","));
    url.searchParams.set(
      "fields",
      "code,product_name,product_name_en,image_front_url,images,lang,lc",
    );
    url.searchParams.set("page_size", "100");
    try {
      const data = await request(url);
      const candidates = food ? data.hits : data.products;
      if (!Array.isArray(candidates))
        throw new Error("Unexpected photo catalog response");
      for (const barcode of pending) {
        for (const candidate of candidates) {
          const photo = selectBarcodePhoto(barcode, candidate, provider);
          if (photo) {
            await savePhoto(barcode, photo);
            break;
          }
        }
        await recordAttempt(barcode, provider.id, true);
      }
    } catch {
      for (const barcode of pending)
        await recordAttempt(barcode, provider.id, false);
    }
  }
  // Free UPCitemdb broadens coverage beyond food/cosmetics. Never create a paid
  // subscription: cap this installation below the free 100 requests/day limit.
  const pending = (await due(barcodes, "upcitemdb")).slice(0, 2);
  if (
    !pending.length ||
    !(await budget("upcitemdb:burst", 1, 10000)) ||
    !(await budget("upcitemdb:day", 90, DAY))
  )
    return;
  const url = new URL("https://api.upcitemdb.com/prod/trial/lookup");
  url.searchParams.set(
    "upc",
    pending
      .map((b) => barcodeAliases(b).find((a) => a.length === 13) || b)
      .join(","),
  );
  try {
    const data = await request(url);
    if (data.code !== "OK" || !Array.isArray(data.items))
      throw new Error("Unexpected UPC response");
    for (const barcode of pending) {
      for (const candidate of data.items) {
        const photo = selectBarcodePhoto(barcode, candidate, "upcitemdb");
        if (photo) {
          await savePhoto(barcode, photo);
          break;
        }
      }
      await recordAttempt(barcode, "upcitemdb", true);
    }
  } catch {
    for (const barcode of pending)
      await recordAttempt(barcode, "upcitemdb", false);
  }
}

export async function resolveProductPhotos(products: Item[]) {
  const identities = products.map((p) => ({
    product: p,
    barcode: normalizeBarcode(p.barcode || p.sku),
  }));
  const barcodes = [
    ...new Set(
      identities
        .filter((i) => !i.product.image_url)
        .map((i) => i.barcode)
        .filter(Boolean),
    ),
  ];
  for (const { product, barcode } of identities)
    if (barcode)
      await run(
        `INSERT INTO product_barcodes(product_id,barcode) VALUES(?,?)
      ON CONFLICT(product_id) DO NOTHING`,
        product.id,
        barcode,
      );
  const key = [...barcodes].sort().join(",");
  if (key) {
    let work = inFlight.get(key);
    if (!work) {
      work = lookupBatch(barcodes).finally(() => inFlight.delete(key));
      inFlight.set(key, work);
    }
    await work;
  }
  const images = [];
  for (const { product, barcode } of identities) {
    if (product.image_url) {
      images.push({
        id: product.id,
        status: "matched",
        imageUrl: product.image_url,
        imageThumbnailUrl: product.image_url,
        imageSource: null,
        retryAfter: 0,
      });
      continue;
    }
    const photo = barcode
      ? await row("SELECT * FROM product_image_cache WHERE barcode=?", barcode)
      : undefined;
    const attempts = barcode
      ? await rows(
          "SELECT provider,retry_at,completed FROM product_image_lookups WHERE barcode=?",
          barcode,
        )
      : [];
    const complete =
      attempts.length === 4 &&
      attempts.every((a) => a.completed && a.retry_at > Date.now());
    images.push({
      id: product.id,
      status: photo
        ? "matched"
        : !barcode
          ? "no_barcode"
          : complete
            ? "unavailable"
            : "pending",
      imageUrl: photo?.image_url || "",
      imageThumbnailUrl: photo?.thumbnail_url || "",
      imageSource: photo ? JSON.parse(photo.source_json) : null,
      // Provider outages/rate limits are recoverable; photos never block shopping.
      retryAfter: photo || !barcode || complete ? 0 : 60,
    });
  }
  return images;
}
