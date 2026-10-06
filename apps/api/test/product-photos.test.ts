import { test, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = ":memory:";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
process.env.JWT_SECRET =
  "product-photos-tests-only-secret-aaaaaaaaaaaaaaaaaaaa";
const { normalizeBarcode, barcodeAliases } = await import("../src/barcodes.js");
const { selectBarcodePhoto, resolveProductPhotos } =
  await import("../src/product-photos.js");
const { run, row, now, db } = await import("../src/db.js");
const food = { id: "food", name: "Open Food Facts", host: "openfoodfacts.org" };
const code = "3017620422003",
  other = "4002293401102",
  barcode = normalizeBarcode(code);
const front =
  "https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.7.400.jpg";
beforeEach(async () => {
  mock.restoreAll();
  for (const table of [
    "product_name_photos",
    "product_barcodes",
    "product_image_cache",
    "product_image_lookups",
    "rate_limit_buckets",
  ])
    await run(`DELETE FROM ${table}`);
});
after(() => {
  mock.restoreAll();
  db.close();
});
async function product(sku = code, extra: Record<string, unknown> = {}) {
  const id = randomUUID(),
    category = randomUUID();
  await run("INSERT INTO categories(id,name) VALUES(?,?)", category, category);
  await run(
    "INSERT INTO products(id,sku,name,category_id,price,mrp,stock,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    id,
    `${sku}-${id}`,
    "Product",
    category,
    100,
    100,
    17,
    now(),
    now(),
  );
  return { id, sku, name: "Product", image_url: "", ...extra };
}
function fakeFetch(fn: (url: URL) => Record<string, unknown> | number) {
  return mock.method(globalThis, "fetch", async (input: any) => {
    const data = fn(new URL(String(input)));
    return typeof data === "number"
      ? new Response("unavailable", { status: data })
      : new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
  });
}
test("GTIN checks reject internal/zero/wrong-checksum SKUs and preserve EAN/UPC aliases", () => {
  assert.equal(normalizeBarcode(code), "03017620422003");
  assert.equal(
    normalizeBarcode("737628064502"),
    normalizeBarcode("0737628064502"),
  );
  for (const value of [
    "POS-1234",
    "0089000001",
    "0",
    "0000000000000",
    "3017620422004",
    "3017620422003&code=123",
  ])
    assert.equal(normalizeBarcode(value), "", value);
  assert.ok(barcodeAliases(barcode).includes(code));
});
test("Only the exact returned barcode and a catalog-hosted HTTPS front image are accepted", () => {
  const data = { code, product_name: "Nutella", image_front_url: front };
  assert.equal(
    selectBarcodePhoto(barcode, data, food)?.imageUrl,
    front.replace(".400.jpg", ".full.jpg"),
  );
  assert.equal(
    selectBarcodePhoto(barcode, { ...data, code: other }, food),
    undefined,
  );
  assert.equal(
    selectBarcodePhoto(
      barcode,
      { ...data, image_front_url: "https://unrelated.example/photo.jpg" },
      food,
    ),
    undefined,
  );
  assert.equal(
    selectBarcodePhoto(
      barcode,
      { ...data, image_front_url: front.replace("https:", "http:") },
      food,
    ),
    undefined,
  );
});
test("Search-a-licious selected front metadata produces the documented full-size and thumbnail URLs", () => {
  const photo = selectBarcodePhoto(
    barcode,
    {
      code,
      lang: "en",
      images: {
        front_en: {
          rev: "7",
          sizes: { "400": { w: 350, h: 400 }, full: { w: 1200, h: 1300 } },
        },
        ingredients_en: { rev: "8", sizes: { "400": {} } },
      },
    },
    food,
  );
  assert.equal(photo?.imageThumbnailUrl, front);
  assert.equal(photo?.imageSource.barcode, barcode);
  assert.equal(
    selectBarcodePhoto(
      barcode,
      { code, images: { "1": { sizes: { "400": {} } } } },
      food,
    ),
    undefined,
  );
});
test("UPCitemdb cannot substitute another barcode or an insecure image", () => {
  const data = {
    ean: code,
    title: "Nutella",
    images: ["https://cdn.example/nutella.jpg"],
  };
  assert.equal(
    selectBarcodePhoto(barcode, data, "upcitemdb")?.imageSource.provider,
    "UPCitemdb",
  );
  assert.equal(
    selectBarcodePhoto(barcode, { ...data, ean: other }, "upcitemdb"),
    undefined,
  );
  assert.equal(
    selectBarcodePhoto(
      barcode,
      { ...data, images: ["http://cdn.example/a.jpg"] },
      "upcitemdb",
    ),
    undefined,
  );
});
test("Barcode images are persisted, reused across products and do not change price/stock", async () => {
  const first = await product(),
    second = await product("ERP-INTERNAL", { barcode });
  const fetch = fakeFetch((url) => {
    assert.equal(url.host, "search.openfoodfacts.org");
    assert.ok(url.searchParams.get("q")?.includes(code));
    return {
      hits: [
        { code: other, image_front_url: front },
        { code, image_front_url: front },
      ],
    };
  });
  const photos = await resolveProductPhotos([first, second]);
  assert.equal(photos[0].status, "matched");
  assert.equal(photos[1].imageUrl, photos[0].imageUrl);
  await resolveProductPhotos([first]);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(
    (await row("SELECT stock FROM products WHERE id=?", first.id))!.stock,
    17,
  );
  assert.equal(
    (await row("SELECT price FROM products WHERE id=?", first.id))!.price,
    100,
  );
});
test("Unavailable barcodes stay empty and negative caching avoids repeated provider requests", async () => {
  const p = await product();
  const fetch = fakeFetch((url) =>
    url.host === "search.openfoodfacts.org"
      ? { hits: [] }
      : url.host === "api.upcitemdb.com"
        ? { code: "OK", items: [] }
        : { products: [] },
  );
  const images = await resolveProductPhotos([p]);
  assert.equal(images[0].status, "unavailable");
  assert.equal(images[0].imageUrl, "");
  assert.equal(fetch.mock.callCount(), 5);
  await resolveProductPhotos([p]);
  assert.equal(fetch.mock.callCount(), 5);
});
test("Provider rate limits are recoverable and never cause catalog failure or wrong fallback photos", async () => {
  const p = await product();
  const fetch = fakeFetch(() => 429);
  const [image] = await resolveProductPhotos([p]);
  assert.equal(image.status, "pending");
  assert.equal(image.imageUrl, "");
  assert.equal(image.retryAfter, 60);
  await resolveProductPhotos([p]);
  assert.equal(fetch.mock.callCount(), 5);
});
test("Unidentifiable generic names and merchant photos never contact external catalogs", async () => {
  const p = await product("POS-PAPAD"),
    merchant = await product("ERP-12", {
      image_url: "https://mart.example/real.jpg",
    });
  const fetch = fakeFetch(() => {
    throw new Error("Unexpected catalog request");
  });
  const images = await resolveProductPhotos([p, merchant]);
  assert.equal(images[0].status, "unavailable");
  assert.equal(images[1].imageUrl, merchant.image_url);
  assert.equal(fetch.mock.callCount(), 0);
});
