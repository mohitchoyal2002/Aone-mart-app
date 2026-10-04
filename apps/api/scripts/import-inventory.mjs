import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

// Uses the same authenticated preview/commit endpoints as the Android app.
// Preview is the default; --commit is required before inventory can change.
const [file, origin = "http://127.0.0.1:4000", mode] = process.argv.slice(2);
if (!file || (mode !== undefined && mode !== "--commit")) {
  console.error("Usage: node --env-file=apps/api/.env apps/api/scripts/import-inventory.mjs inventory.csv [API_ORIGIN] [--commit]");
  process.exit(1);
}
const server = new URL(origin);
if (server.username || server.password || server.pathname !== "/" ||
  server.search || server.hash || !["http:", "https:"].includes(server.protocol) ||
  (server.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]"].includes(server.hostname))) {
  throw new Error("Use a backend HTTPS origin, or HTTP localhost, without credentials or a path.");
}
const info = await stat(file);
if (!info.isFile() || info.size > 5 * 1024 * 1024) throw new Error("Choose a CSV no larger than 5 MB.");
if (!process.env.ADMIN_PHONE || !process.env.ADMIN_PASSWORD) throw new Error("Set private ADMIN_PHONE and ADMIN_PASSWORD environment variables.");
async function call(path, options) {
  const response = await fetch(server.origin + path, { ...options, signal: AbortSignal.timeout(60000) });
  const body = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.error || "Request failed"}`);
  return body;
}
try {
  const session = await call("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: process.env.ADMIN_PHONE, password: process.env.ADMIN_PASSWORD, role: "admin" }),
  });
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const form = new FormData();
  form.set("type", "products");
  form.set("file", new Blob([await readFile(file)], { type: "text/csv" }), basename(file));
  const { preview } = await call("/api/admin/imports/preview", { method: "POST", headers, body: form });
  console.log(JSON.stringify({ filename: preview.filename, rows: preview.rowCount, validRows: preview.validRows, canCommit: preview.canCommit, errors: preview.errors, note: preview.note }, null, 2));
  if (!preview.canCommit) throw new Error("Import blocked; correct the reported rows and upload again.");
  if (mode === "--commit") {
    const result = await call(`/api/admin/imports/${preview.id}/commit`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}",
    });
    console.log(JSON.stringify({ commit: result }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Import failed");
  process.exitCode = 1;
}
