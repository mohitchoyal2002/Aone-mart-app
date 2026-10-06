const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");
const sharp = require("sharp");
const root = join(__dirname, "..");
const exportsObject = {};
const compiled = ts.transpileModule(
  readFileSync(join(root, "apps/mobile/src/product-images.ts"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
runInNewContext(compiled, { exports: exportsObject });
const { productPhotoKind } = exportsObject;

test("Actual product names never select a stock photo, including the reported mismatches", () => {
  for (const name of [
    "365 DAYS PRNNI PASTA 250GM",
    "420 CHANA CHATPATA PAPAD",
    "420 MOONG PUNJABI MASALA PAPAD",
    "420 MOONG SPECIAL PAPAD",
    "5STAR OREO 20MRP",
    "A ONE AGARBATTI 180G",
    "A ONE AGARBATTI 1KG",
    "A ONE AGARBATTI 260G",
    "Amul Milk500ml",
    "Toor Dal",
    "Basmati Rice",
    "Dove milk soap",
    "Milk tea",
    "मूंग दाल",
    "दूध",
    "Unknown item 123",
  ])
    for (const artwork of ["bag", "rice", "milk", "snack", "soap"])
      assert.equal(
        productPhotoKind({ name, category: "Dairy", artwork }),
        null,
        name,
      );
});
test("Stock images are reserved for decorative category tiles without product identities", () => {
  assert.equal(productPhotoKind({ artwork: "bag" }), "grocery");
  assert.equal(productPhotoKind({ category: "Dairy" }), "milk");
  assert.equal(productPhotoKind({ artwork: "tea" }), "tea");
});

test("Bundled product photos are WebP, with small thumbnails and separate high resolution images", async () => {
  const directory = join(root, "apps/mobile/assets/products");
  const sources = JSON.parse(
    readFileSync(join(directory, "sources.json"), "utf8"),
  );
  let bytes = 0;
  for (const { id: kind } of sources) {
    for (const thumbnail of [false, true]) {
      const file = join(directory, `${kind}${thumbnail ? "-thumb" : ""}.webp`);
      const image = await sharp(file).metadata();
      assert.equal(image.format, "webp");
      assert.equal(image.width, thumbnail ? 384 : 1024);
      assert.equal(image.height, thumbnail ? 384 : 1024);
      const size = statSync(file).size;
      assert.ok(size < (thumbnail ? 100000 : 500000), `${file} is too large`);
      bytes += size;
    }
  }
  assert.equal(
    readdirSync(directory).filter((n) => n.endsWith(".webp")).length,
    24,
  );
  assert.ok(
    bytes < 3 * 1024 * 1024,
    "Product photo library exceeds its bundle budget",
  );
});
