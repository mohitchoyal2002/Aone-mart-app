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

test("CSV names choose product photos despite default bag artwork or broad categories", () => {
  for (const [name, expected] of [
    ["India Gate Basmati Rice 1KG", "rice"],
    ["Amul Milk500ml", "milk"],
    ["SunflowerOil1LTR", "oil"],
    ["5KG-AASHIRVAAD_ATTA", "flour"],
    ["TATA Toor Dal", "lentils"],
    ["PARLE MILK BISCUITS", "snack"],
    ["Britannia Bread", "bread"],
    ["Tata Tea", "tea"],
    ["बासमती चावल", "rice"],
    ["गेहूं आटा", "flour"],
    ["मूंग दाल", "lentils"],
    ["दूध", "milk"],
    ["साबुन", "soap"],
    ["Fresh red apples", "apple"],
    ["Garden broccoli", "broccoli"],
  ])
    assert.equal(
      productPhotoKind({ name, category: "General", artwork: "bag" }),
      expected,
      name,
    );
});

test("Unrecognized imports stay neutral, and existing artwork/category remain useful", () => {
  assert.equal(
    productPhotoKind({ name: "ALUMINIUM FOIL", category: "General" }),
    "grocery",
  );
  assert.equal(
    productPhotoKind({ name: "Item 123", category: "General" }),
    "grocery",
  );
  assert.equal(
    productPhotoKind({ name: "Item 123", category: "Dairy" }),
    "milk",
  );
  assert.equal(productPhotoKind({ name: "Item 123", artwork: "tea" }), "tea");
  assert.equal(productPhotoKind({ name: "Atta", artwork: "rice" }), "flour");
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
