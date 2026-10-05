const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { randomBytes } = require("node:crypto");
const ts = require("typescript");
const babel = require("@babel/core");
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const root = join(__dirname, "..");

// Exercise the installed SDK's real JS serializers without loading native
// modules in Node. Native File bindings expose getters on the prototype.
function evaluate(code, dependencies = {}, globals = {}) {
  const exports = {};
  runInNewContext(code, {
    exports,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
      return dependencies[name];
    },
    Blob, TextEncoder, URL, Headers, Response, AbortController,
    setTimeout, clearTimeout, process: { env: {} }, __DEV__: true,
    ...globals,
  });
  return exports;
}
function loadTs(path, dependencies, globals) {
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  return evaluate(outputText, dependencies, globals);
}
const rnCode = babel.transformSync(
  readFileSync(join(root, "node_modules/react-native/Libraries/Network/FormData.js"), "utf8"),
  { babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-flow-strip-types", "@babel/plugin-transform-modules-commonjs"] },
).code;
const NativeFormData = evaluate(rnCode).default;
const { installFormDataPatch } = loadTs(join(root, "node_modules/expo/src/winter/FormData.ts"));
installFormDataPatch(NativeFormData);
const { convertFormDataAsync } = loadTs(
  join(root, "node_modules/expo/src/winter/fetch/convertFormData.ts"),
  { "../../utils/blobUtils": { blobToArrayBufferAsync: (blob) => blob.arrayBuffer() } },
);

function fileSystem() {
  const files = new Map();
  class File {
    #uri;
    constructor(uri) { this.#uri = uri; }
    get uri() { return this.#uri; }
    get name() { return this.uri.split("/").pop(); }
    get type() { return this.name.endsWith(".csv") ? "text/csv" : "image/jpeg"; }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.length || 0; }
    async bytes() { return new Uint8Array(files.get(this.uri)); }
    delete() { files.delete(this.uri); }
  }
  return { File, files };
}

async function client(t, expired = false) {
  const app = express();
  app.use(express.json());
  let refreshes = 0;
  app.post("/api/auth/refresh", (req, res) => {
    assert.equal(req.body.refreshToken, "refresh-token");
    refreshes++;
    res.json({ accessToken: "active-token", refreshToken: "new-refresh", user: { id: "admin" } });
  });
  app.use((req, res, next) => {
    if (req.headers.authorization === "Bearer expired-token") {
      res.status(401).json({ error: "Expired session" });
      return;
    }
    next();
  });
  app.use(multer().single("file"));
  app.use((req, res) => res.json({
    method: req.method,
    authorization: req.headers.authorization,
    fields: req.body,
    file: req.file && { name: req.file.originalname, type: req.file.mimetype, bytes: req.file.buffer.toString("base64") },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const saved = new Map([
    ["aone-access", expired ? "expired-token" : "active-token"],
    ["aone-refresh", "refresh-token"],
  ]);
  const { api } = loadTs(join(root, "apps/mobile/src/api.ts"), {
    "expo-secure-store": {
      getItemAsync: async (key) => saved.get(key),
      setItemAsync: async (key, value) => saved.set(key, value),
      deleteItemAsync: async (key) => saved.delete(key),
    },
    "@react-native-async-storage/async-storage": { getItem: async () => origin },
    "expo-constants": {},
    "expo/fetch": { fetch: async (url, options) => {
      const { body, boundary } = await convertFormDataAsync(options.body);
      const headers = new Headers(options.headers);
      headers.set("Content-Type", `multipart/form-data; boundary=${boundary}`);
      return fetch(url, { ...options, headers, body });
    } },
  }, {
    FormData: NativeFormData,
    fetch: (url, options) => {
      if (options.body instanceof NativeFormData)
        throw new Error("RN fetch loses native File getters");
      return fetch(url, options);
    },
  });
  await api.init();
  return { api, refreshes: () => refreshes };
}

test("native banner create/replace and invoice CSV upload deliver exact file bytes and fields", async (t) => {
  const { api } = await client(t);
  const { File, files } = fileSystem();
  const jpeg = await sharp({ create: { width: 16, height: 8, channels: 3, background: "#F4CF78" } }).jpeg().toBuffer();
  const csv = Buffer.from("Bill No.,Net Amount,RefDate\nSWIL-1,100,2026-10-05\n");
  for (const [path, method, bytes, name, fields] of [
    ["/api/admin/settings/banners", "POST", jpeg, "banner.jpg", { title: "Weekly offers", altText: "Rice offers" }],
    ["/api/admin/settings/banners/existing", "PUT", jpeg, "replacement.jpg", { title: "New offers", altText: "Oil offers" }],
    ["/api/admin/imports/preview", "POST", csv, "sales.csv", { type: "invoices" }],
  ]) {
    const uri = `file:///cache/${name}`;
    files.set(uri, bytes);
    const file = new File(uri);
    const form = new NativeFormData();
    for (const [field, value] of Object.entries(fields)) form.append(field, value);
    form.append("file", file, name);
    // The installed RN serializer drops File's prototype getters. This is the
    // pre-request failure avoided by routing the form through Expo's converter.
    assert.equal(form.getParts().at(-1).uri, undefined);
    const result = await api.request(path, { method, body: form });
    assert.equal(result.method, method);
    assert.equal(result.authorization, "Bearer active-token");
    assert.deepEqual(result.fields, fields);
    assert.equal(result.file.name, name);
    assert.equal(result.file.type, file.type);
    assert.equal(result.file.bytes, bytes.toString("base64"));
  }
});

test("a native file can be uploaded again after an expired session refresh", async (t) => {
  const { api, refreshes } = await client(t, true);
  const { File, files } = fileSystem();
  const bytes = Buffer.from("sku,name\nA,Rice\n");
  files.set("file:///products.csv", bytes);
  const form = new NativeFormData();
  form.append("type", "products");
  form.append("file", new File("file:///products.csv"), "products.csv");
  const result = await api.request("/api/admin/imports/preview", { method: "POST", body: form });
  assert.equal(refreshes(), 1);
  assert.equal(result.authorization, "Bearer active-token");
  assert.equal(result.file.bytes, bytes.toString("base64"));
});

function bannerPreparer(filesystem, original) {
  let counter = 0;
  const ImageManipulator = { manipulate(source) {
    const input = typeof source === "string" ? original : source.bytes;
    let size;
    return {
      resize(value) { size = value; },
      async renderAsync() {
        const bytes = await sharp(input).resize(size).png().toBuffer();
        const { width, height } = await sharp(bytes).metadata();
        return { width, height, bytes, async saveAsync(options) {
          const uri = `file:///cache/image-${++counter}.jpg`;
          filesystem.files.set(uri, await sharp(bytes).jpeg({ quality: Math.round(options.compress * 100) }).toBuffer());
          return { uri };
        } };
      },
    };
  } };
  return loadTs(join(root, "apps/mobile/src/banner-image.ts"), {
    "expo-image-manipulator": { ImageManipulator, SaveFormat: { JPEG: "jpeg" } },
    "expo-file-system": { File: filesystem.File },
  }).prepareBannerImage;
}

test("detailed images shrink until measured JPEG bytes fit the banner upload limit", async () => {
  const filesystem = fileSystem();
  const noise = await sharp(randomBytes(2048 * 2048 * 3), { raw: { width: 2048, height: 2048, channels: 3 } }).png().toBuffer();
  const prepare = bannerPreparer(filesystem, noise);
  const uri = await prepare("file:///detailed.png");
  const bytes = filesystem.files.get(uri);
  const metadata = await sharp(bytes).metadata();
  assert.ok(bytes.length > 0 && bytes.length <= 600 * 1024);
  assert.ok(metadata.width < 1600);
  assert.equal(metadata.width, metadata.height);
  assert.equal(filesystem.files.size, 1, "oversized intermediate copies are removed");
});

test("a detailed wide banner also fits the server's re-encoded storage cap", async () => {
  const filesystem = fileSystem();
  const noise = await sharp(randomBytes(1600 * 800 * 3), { raw: { width: 1600, height: 800, channels: 3 } }).png().toBuffer();
  const uri = await bannerPreparer(filesystem, noise)("file:///wide.png");
  const bytes = filesystem.files.get(uri);
  const stored = await sharp(bytes).rotate().resize({ width: 1600, height: 1000, fit: "inside", withoutEnlargement: true }).flatten({ background: "#FFF9EE" }).jpeg({ quality: 80 }).toBuffer();
  assert.ok(bytes.length <= 600 * 1024);
  assert.ok(stored.length <= 700 * 1024);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width / metadata.height, 2);
});

test("a small wide banner keeps its original dimensions and aspect ratio", async () => {
  const filesystem = fileSystem();
  const original = await sharp({ create: { width: 640, height: 320, channels: 3, background: "#F4CF78" } }).png().toBuffer();
  const uri = await bannerPreparer(filesystem, original)("file:///small.png");
  const metadata = await sharp(filesystem.files.get(uri)).metadata();
  assert.equal(metadata.width, 640);
  assert.equal(metadata.height, 320);
});
