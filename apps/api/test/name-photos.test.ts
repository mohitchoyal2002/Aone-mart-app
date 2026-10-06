import { test, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = ":memory:";
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
process.env.JWT_SECRET = "name-photos-tests-only-secret-aaaaaaaaaaaaaaaaaaaa";
const { namePhotoMatches, selectNamePhoto, resolveNamePhotos } =
  await import("../src/name-photos.js");
const { resolveProductPhotos } = await import("../src/product-photos.js");
const { productSelect, customerProduct } = await import("../src/catalog.js");
const { run, row, now, db } = await import("../src/db.js");
const image = "https://cdn.shopify.com/s/files/1/products/punjabi-masala.png";
const candidate = {
  title: "Agrawal 420 Moong Papad (Punjabi Masala) 200 g",
  vendor: "Agrawal Papad Pvt. Ltd.",
  handle: "agrawal-420-moong-papad-200-g",
  image,
  compare_at_price_max: "97",
};
beforeEach(async () => {
  mock.restoreAll();
  for (const t of [
    "product_name_photos",
    "product_barcodes",
    "product_image_cache",
    "product_image_lookups",
    "rate_limit_buckets",
  ])
    await run(`DELETE FROM ${t}`);
});
after(() => {
  mock.restoreAll();
  db.close();
});
async function product(
  name = "420 MOONG PUNJABI MASALA PAPAD",
  unit = "200 g",
  image_url = "",
) {
  const id = randomUUID(),
    category = randomUUID(),
    sku = `ERP-${id}`;
  await run("INSERT INTO categories(id,name) VALUES(?,?)", category, category);
  await run(
    "INSERT INTO products(id,sku,name,category_id,price,mrp,stock,reserved,unit,image_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    id,
    sku,
    name,
    category,
    5500,
    7700,
    17,
    3,
    unit,
    image_url,
    now(),
    now(),
  );
  return { id, sku, name, unit, barcode: "", image_url };
}
function fakeFetch(fn: (url: URL) => any) {
  return mock.method(globalThis, "fetch", async (input: any) => {
    const d = fn(new URL(String(input)));
    return new Response(
      typeof d === "number" ? "unavailable" : JSON.stringify(d),
      {
        status: typeof d === "number" ? d : 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  });
}
test("Imported names preserve brand/variant, unit conversion and explicit MRP; unrelated packages are rejected", () => {
  const p = { name: "420 MOONG PUNJABI MASALA PAPAD", unit: "200GM" };
  assert.equal(namePhotoMatches(p, candidate), true);
  for (const title of [
    "Other 420 Chana Chatpata Papad 200g",
    "Agrawal 420 Moong Special Papad 200g",
    "Agrawal 420 Moong Papad (Punjabi Masala) 400g",
  ])
    assert.equal(namePhotoMatches(p, { ...candidate, title }), false);
  assert.equal(
    namePhotoMatches(
      { name: "A ONE AGARBATTI 180G" },
      { title: "Cycle Three in One Agarbatti 180g" },
    ),
    false,
  );
  assert.equal(
    namePhotoMatches(
      { name: "365 DAYS PRNNI PASTA 250GM" },
      { title: "365 Everyday Value Penne Pasta 454g" },
    ),
    false,
  );
  assert.equal(
    namePhotoMatches(
      { name: "5STAR OREO 20MRP" },
      { title: "Cadbury 5 Star Oreo Chocolate Bar 40g", mrp: 40 },
    ),
    false,
  );
  assert.equal(
    namePhotoMatches(
      { name: "5STAR OREO 20MRP" },
      { title: "Cadbury 5 Star Oreo Chocolate Bar 22g", mrp: 20 },
    ),
    true,
  );
  assert.equal(
    namePhotoMatches({ name: "Milk" }, { title: "Amul Milk 500ml" }),
    false,
  );
  assert.equal(
    namePhotoMatches({ name: "Brand Milk 1L" }, { title: "Brand Milk 1000ml" }),
    true,
  );
});
test("Ambiguous packs, multipacks, non-catalog images, injected source URLs and private hosts are rejected", () => {
  const p = { name: "420 MOONG PUNJABI MASALA PAPAD", unit: "Pack" };
  assert.equal(selectNamePhoto(p, [candidate], "quickpantry")?.imageUrl, image);
  assert.equal(
    selectNamePhoto(
      p,
      [
        candidate,
        { ...candidate, title: candidate.title.replace("200", "400") },
      ],
      "quickpantry",
    ),
    undefined,
  );
  for (const change of [
    { image: "https://unrelated.example/photo.jpg" },
    { image: "http://cdn.shopify.com/photo.jpg" },
    { handle: "../other?x=1" },
    { title: candidate.title + " Pack of 2" },
  ])
    assert.equal(
      selectNamePhoto(p, [{ ...candidate, ...change }], "quickpantry"),
      undefined,
    );
  assert.equal(
    selectNamePhoto(
      p,
      [
        {
          ...candidate,
          ean: "3017620422003",
          images: ["https://127.0.0.1/photo.jpg"],
        },
      ],
      "upc-name",
    ),
    undefined,
  );
});
test("Missing EAN resolves from public product names, persists source and returns through catalog with unchanged stock/prices", async () => {
  const p = await product();
  const f = fakeFetch((url) => {
    assert.equal(url.host, "www.quickpantry.in");
    assert.ok(url.searchParams.get("q")?.includes("punjabi"));
    return { resources: { results: { products: [candidate] } } };
  });
  const [first] = await resolveProductPhotos([p]);
  assert.equal(first.status, "matched");
  assert.equal(first.imageSource.matchMethod, "name");
  assert.equal(first.imageUrl, image);
  await resolveProductPhotos([p]);
  assert.equal(f.mock.callCount(), 1);
  const stored = (await row(productSelect + " WHERE p.id=?", p.id))!;
  assert.equal(customerProduct(stored).imageUrl, image);
  assert.equal(stored.stock, 17);
  assert.equal(stored.reserved, 3);
  assert.equal(stored.price, 5500);
  await run("UPDATE products SET unit=? WHERE id=?", "400 g", p.id);
  assert.equal(
    customerProduct((await row(productSelect + " WHERE p.id=?", p.id))!)
      .imageUrl,
    "",
  );
  await run(
    "UPDATE products SET unit=?,name=? WHERE id=?",
    "200 g",
    "420 MOONG SPECIAL PAPAD",
    p.id,
  );
  assert.equal(
    customerProduct((await row(productSelect + " WHERE p.id=?", p.id))!)
      .imageUrl,
    "",
  );
});
test("Name lookup does not fetch merchant photos and respects persisted negative-cache results", async () => {
  const p = await product(),
    merchant = await product(
      "A ONE AGARBATTI 180G",
      "Pack",
      "https://mart.example/actual.jpg",
    );
  const f = fakeFetch((url) =>
    url.host === "www.quickpantry.in"
      ? { resources: { results: { products: [] } } }
      : url.host === "search.openfoodfacts.org"
        ? { hits: [] }
        : { code: "OK", items: [] },
  );
  const [first] = await resolveNamePhotos([p, merchant]);
  assert.equal(first.status, "unavailable");
  assert.equal(first.imageUrl, "");
  assert.equal(f.mock.callCount(), 3);
  await resolveNamePhotos([p, merchant]);
  assert.equal(f.mock.callCount(), 3);
});
test("Provider outages remain retryable and never create a substitute image", async () => {
  const p = await product();
  const f = fakeFetch(() => 429);
  const [first] = await resolveNamePhotos([p]);
  assert.equal(first.status, "pending");
  assert.equal(first.imageUrl, "");
  assert.ok(first.retryAfter >= 60);
  await resolveNamePhotos([p]);
  assert.equal(f.mock.callCount(), 3);
});
test("Shared rate caps queue remaining items and bound a large request without blocking catalog reads", async () => {
  const products = await Promise.all(
    Array.from({ length: 12 }, (_, n) => product(`Unknown Brand Product ${n}`)),
  );
  const f = fakeFetch((url) =>
    url.host === "www.quickpantry.in"
      ? { resources: { results: { products: [] } } }
      : url.host === "search.openfoodfacts.org"
        ? { hits: [] }
        : { code: "OK", items: [] },
  );
  const results = await resolveNamePhotos(products);
  assert.equal(results.length, 12);
  assert.ok(
    results.slice(6).every((p) => p.status === "pending" && p.retryAfter >= 60),
  );
  assert.equal(f.mock.callCount(), 9); // six retail, two OFF, one shared free UPC burst.
});

test("Unbranded generic names and contradictory pack metadata cannot borrow another product's photo", () => {
  assert.equal(
    namePhotoMatches(
      { name: "Premium Basmati Rice", unit: "1 kg" },
      { title: "Unrelated Brand Premium Basmati Rice 1 kg" },
    ),
    false,
  );
  assert.equal(
    namePhotoMatches(
      { name: "420 MOONG PUNJABI MASALA PAPAD", unit: "200 g" },
      { ...candidate, quantity: "400 g" },
    ),
    false,
  );
});
