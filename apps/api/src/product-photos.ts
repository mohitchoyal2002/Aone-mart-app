import { resolveNamePhotos } from "./name-photos.js";
import { rows, run, transaction, batchRun } from "./db.js";
import { DatabaseRateStore } from "./rate-store.js";
import { normalizeBarcode, barcodeAliases } from "./barcodes.js";

export type PhotoSource = {
  provider: string;
  url: string;
  license: string;
  barcode: string;
  productName: string;
  matchMethod?: "barcode" | "name";
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
  "AoneMart/1.2.2 (https://github.com/mohitchoyal2002/Aone-mart-app)";
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
async function recordAttempts(
  barcodes: string[],
  provider: string,
  success: boolean,
) {
  const retryAt = Date.now() + (success ? 7 * DAY : 10 * 60000);
  await transaction(() =>
    batchRun(
      barcodes.map((barcode) => ({
        sql: `INSERT INTO product_image_lookups(barcode,provider,retry_at,completed) VALUES(?,?,?,?)
      ON CONFLICT(barcode,provider) DO UPDATE SET retry_at=excluded.retry_at,completed=excluded.completed`,
        args: [barcode, provider, retryAt, success ? 1 : 0],
      })),
    ),
  );
}
async function due(barcodes: string[], provider: string): Promise<string[]> {
  if (!barcodes.length) return [];
  const marks = barcodes.map(() => "?").join(",");
  const cached = await rows(
    `SELECT barcode FROM product_image_cache WHERE barcode IN (${marks})`,
    ...barcodes,
  );
  const attempts = await rows(
    `SELECT barcode FROM product_image_lookups WHERE provider=? AND retry_at>? AND barcode IN (${marks})`,
    provider,
    Date.now(),
    ...barcodes,
  );
  const skip = new Set([...cached, ...attempts].map((p) => p.barcode));
  return barcodes.filter((b) => !skip.has(b));
}
async function lookupBatch(barcodes: string[]) {
  for (const provider of providers) {
    const pending = await due(barcodes, provider.id);
    if (
      !pending.length ||
      !(await budget(`${provider.id}:search`, provider.id === "food" ? 3 : 6))
    )
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
      let candidates: Item[] = [];
      let complete = false;
      try {
        const data = await request(url);
        candidates = food ? data.hits : data.products;
        if (!Array.isArray(candidates))
          throw new Error("Unexpected photo catalog response");
        complete = !food;
      } catch (error) {
        if (!food) throw error;
        candidates = [];
      }
      if (food) {
        const missing = pending.filter(
          (b) => !candidates.some((c) => selectBarcodePhoto(b, c, provider)),
        );
        if (missing.length) {
          // Search indexes can lag new products. Confirm misses against the
          // current catalog before negative-caching an EAN as unavailable.
          const live = new URL("https://world.openfoodfacts.org/api/v2/search");
          live.searchParams.set(
            "code",
            missing.flatMap(barcodeAliases).join(","),
          );
          live.searchParams.set("fields", url.searchParams.get("fields")!);
          live.searchParams.set("page_size", "100");
          try {
            const data = await request(live);
            if (!Array.isArray(data.products))
              throw new Error("Unexpected live photo catalog response");
            candidates.push(...data.products);
            complete = true;
          } catch {
            complete = false;
          }
        } else complete = true;
      }
      for (const barcode of pending) {
        for (const candidate of candidates) {
          const photo = selectBarcodePhoto(barcode, candidate, provider);
          if (photo) {
            await savePhoto(barcode, photo);
            break;
          }
        }
      }
      await recordAttempts(pending, provider.id, complete);
    } catch {
      await recordAttempts(pending, provider.id, false);
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
    }
    await recordAttempts(pending, "upcitemdb", true);
  } catch {
    await recordAttempts(pending, "upcitemdb", false);
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
  const identifiers = identities.filter((i) => i.barcode && !i.product.barcode);
  if (identifiers.length)
    await transaction(() =>
      batchRun(
        identifiers.map(({ product, barcode }) => ({
          sql: "INSERT INTO product_barcodes(product_id,barcode) VALUES(?,?) ON CONFLICT(product_id) DO NOTHING",
          args: [product.id, barcode],
        })),
      ),
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
  const images: Record<string, any>[] = [];
  const marks = barcodes.map(() => "?").join(",");
  const cached = barcodes.length
    ? await rows(
        `SELECT * FROM product_image_cache WHERE barcode IN (${marks})`,
        ...barcodes,
      )
    : [];
  const lookupStates = barcodes.length
    ? await rows(
        `SELECT barcode,provider,retry_at,completed FROM product_image_lookups WHERE barcode IN (${marks})`,
        ...barcodes,
      )
    : [];
  const photos = new Map(cached.map((p) => [p.barcode, p]));
  for (const { product, barcode } of identities) {
    if (product.image_url) {
      images.push({
        id: product.id,
        status: "matched",
        imageUrl: product.image_url,
        imageThumbnailUrl:
          product.image_url + (product.uploaded_image_id ? "?size=thumb" : ""),
        imageSource: null,
        retryAfter: 0,
      });
      continue;
    }
    const photo = photos.get(barcode);
    const attempts = lookupStates.filter((a) => a.barcode === barcode);
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
  const byName = await resolveNamePhotos(
    identities
      .filter(
        ({ product }) =>
          !images.some((i) => i.id === product.id && i.status === "matched"),
      )
      .map(({ product, barcode }) => ({ ...product, barcode })),
  );
  return images.map((i) => {
    if (i.status === "matched") return i;
    const match = byName.find((n) => n.id === i.id);
    if (!match)
      return {
        ...i,
        status: i.status === "no_barcode" ? "unavailable" : i.status,
      };
    if (match.status === "matched") return match;
    return {
      ...match,
      status:
        i.status === "pending" || match.status === "pending"
          ? "pending"
          : "unavailable",
      retryAfter: Math.max(i.retryAfter, match.retryAfter),
    };
  });
}
