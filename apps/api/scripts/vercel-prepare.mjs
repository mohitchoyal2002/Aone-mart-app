import { createClient } from "@libsql/client/http";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { schemaSQL, schemaVersion } from "../src/schema.ts";

let stage = "configuration";
let client, server, database;
try {
  for (const key of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "JWT_SECRET"])
    if (!process.env[key])
      throw new Error("Missing required deployment configuration");
  client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
    intMode: "number",
  });
  stage = "schema migration";
  stage = "schema version read";
  const version = Number(
    (await client.execute("PRAGMA user_version")).rows[0][0],
  );
  if (version > schemaVersion)
    throw new Error("Database schema is newer than this application");
  const { defaultStore, row, rows, run, transaction, db } = await import(
    "../src/db.ts"
  );
  database = db;
  stage = "schema write transaction";
  const tx = await client.transaction("write");
  try {
    stage = "schema DDL execution";
    await tx.batch(
      schemaSQL
        .split(";")
        .map((sql) => sql.trim())
        .filter((sql) => sql && !sql.startsWith("PRAGMA")),
    );
    stage = "store settings initialization";
    await tx.execute({
      sql: "INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)",
      args: ["store", JSON.stringify(defaultStore)],
    });
    await tx.execute({
      sql: "INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)",
      args: ["schemaVersion", String(schemaVersion)],
    });
    stage = "schema transaction commit";
    await tx.commit();
  } catch (error) {
    if (!tx.closed) await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
  stage = "foreign key configuration";
  if (Number((await client.execute("PRAGMA foreign_keys")).rows[0][0]) !== 1)
    throw new Error("Foreign key protection is required");
  console.log(`Permanent database schema ready: ${schemaVersion}`);

  stage = "transaction verification";
  const probe = "deploy_probe_" + randomUUID().replaceAll("-", "");
  await run(
    `CREATE TABLE ${probe}(id TEXT PRIMARY KEY,stock INTEGER NOT NULL,reserved INTEGER NOT NULL CHECK(reserved<=stock),parent TEXT REFERENCES users(id))`,
  );
  try {
    let rejected = false;
    try {
      await transaction(async () => {
        await run(`INSERT INTO ${probe} VALUES('rollback',1,0,NULL)`);
        throw new Error("Rollback probe");
      });
    } catch {
      rejected = true;
    }
    if (!rejected || (await row(`SELECT id FROM ${probe} WHERE id='rollback'`)))
      throw new Error("Rollback verification failed");
    rejected = false;
    try {
      await transaction(async () => {
        await run(`INSERT INTO ${probe} VALUES('fk',1,0,'missing')`);
      });
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Foreign key verification failed");
    await run(`INSERT INTO ${probe} VALUES('stock',1,0,NULL)`);
    const attempts = await Promise.allSettled(
      [0, 1].map(() =>
        transaction(async () =>
          Number(
            (
              await run(
                `UPDATE ${probe} SET reserved=reserved+1 WHERE id='stock' AND stock-reserved>=1`,
              )
            ).changes,
          ),
        ),
      ),
    );
    const successes = attempts.filter(
      (result) => result.status === "fulfilled" && result.value === 1,
    ).length;
    if (
      successes !== 1 ||
      (await row(`SELECT reserved FROM ${probe} WHERE id='stock'`)).reserved !==
        1
    )
      throw new Error("Concurrent reservation verification failed");
  } finally {
    await run(`DROP TABLE ${probe}`);
  }
  console.log(
    "Remote rollback, foreign keys and concurrent reservation verified",
  );

  stage = "administrator bootstrap";
  const needsAdmin =
    Number(
      (
        await row(
          "SELECT count(*) count FROM users WHERE role='admin' AND deleted_at IS NULL",
        )
      ).count,
    ) === 0;
  const setupCredentials =
    !!process.env.ADMIN_PHONE && !!process.env.ADMIN_PASSWORD;
  if (needsAdmin && !setupCredentials)
    throw new Error(
      "First deployment requires one-time administrator setup credentials",
    );
  if (setupCredentials)
    await (await import("../src/bootstrap.ts")).bootstrapAdmin();
  console.log("Administrator ready; existing account credentials retained");
  stage = "authenticated API verification";
  const { app } = await import("../src/app.ts");
  server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function call(path, options = {}) {
    const response = await fetch(origin + path, {
      ...options,
      signal: AbortSignal.timeout(120000),
    });
    const body = await response.json();
    if (!response.ok)
      console.error(
        "HTTP verification failed",
        path,
        response.status,
        body.code || "unknown",
      );
    if (!response.ok)
      throw new Error(`API verification returned HTTP ${response.status}`);
    return body;
  }
  const health = await call("/health");
  if (!health.ok || health.database !== "turso")
    throw new Error("Health verification failed");
  if (setupCredentials) {
    const session = await call("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: process.env.ADMIN_PHONE,
        password: process.env.ADMIN_PASSWORD,
        role: "admin",
      }),
    });
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    try {
      const csv = process.env.INITIAL_INVENTORY_CSV_BASE64;
      if (csv) {
        stage = "initial inventory import";
        const bytes = Buffer.from(csv, "base64");
        if (bytes.length > 4 * 1024 * 1024)
          throw new Error("Initial inventory exceeds the upload limit");
        const checksum = createHash("sha256")
          .update("products")
          .update(bytes)
          .digest("hex");
        const existing = await row(
          "SELECT id FROM import_batches WHERE checksum=? AND status='committed'",
          checksum,
        );
        if (!existing) {
          const records = parse(bytes, {
            bom: true,
            columns: true,
            skip_empty_lines: true,
            trim: true,
          });
          const form = new FormData();
          form.set("type", "products");
          form.set(
            "file",
            new Blob([bytes], { type: "text/csv" }),
            "inventory.csv",
          );
          const { preview } = await call("/api/admin/imports/preview", {
            method: "POST",
            headers,
            body: form,
          });
          if (!preview.canCommit || preview.validRows !== records.length)
            throw new Error("Initial inventory failed validation");
          const committed = await call(
            `/api/admin/imports/${preview.id}/commit`,
            {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              body: "{}",
            },
          );
          if (committed.importedRows !== records.length)
            throw new Error("Inventory commit count mismatch");
          const expected = (
            await (
              await import("../src/imports.ts")
            ).validateRows("products", records)
          ).normalized;
          const actual = new Map(
            (
              await rows(
                "SELECT p.*,s.record_json FROM products p JOIN product_import_sources s ON s.product_id=p.id WHERE s.import_batch_id=?",
                preview.id,
              )
            ).map((product) => [product.sku, product]),
          );
          for (const item of expected) {
            const product = actual.get(item.sku);
            if (
              !product ||
              product.price !== Math.round(item.price * 100) ||
              product.mrp !== Math.round(item.mrp * 100) ||
              product.stock !== item.stock ||
              product.unit !== item.unit ||
              JSON.stringify(JSON.parse(product.record_json)) !==
                JSON.stringify(item.source_record)
            )
              throw new Error("Imported source data mismatch");
          }
          console.log(
            `Real inventory imported and verified: ${expected.length} products, ${expected.reduce((total, item) => total + item.stock, 0)} units`,
          );
        } else
          console.log(
            "Initial inventory already committed; current stock retained",
          );
      }
      stage = "catalog and report verification";
      const catalog = await call("/api/catalog/products?limit=100", {
        headers,
      });
      if (!Array.isArray(catalog.products))
        throw new Error("Catalog verification failed");
      await call("/api/admin/reports/dashboard", { headers });
      await call("/api/admin/settings", { headers });
      console.log(
        "Authenticated catalog, inventory dashboard and settings verified",
      );
    } finally {
      await call("/api/auth/logout", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    }
  } else {
    if (process.env.INITIAL_INVENTORY_CSV_BASE64)
      throw new Error(
        "Initial import requires one-time administrator credentials",
      );
    const catalog = await call("/api/catalog/store");
    if (!catalog.store?.name) throw new Error("Catalog verification failed");
    console.log("Health, permanent database and public catalog verified");
  }
  // Maintenance is safe to repeat during each deployment; no background timers needed.
  await run(
    "DELETE FROM rate_limit_buckets WHERE reset_at<?",
    Date.now() - 86400000,
  );
  await run(
    "DELETE FROM refresh_sessions WHERE expires_at<?",
    new Date().toISOString(),
  );
  console.log("Vercel preparation completed; notifications remain disabled");
} catch (error) {
  // Provider errors may contain URLs or credentials. Emit only a stage and class/code.
  console.error(
    "Vercel preparation failed",
    stage,
    error instanceof Error ? error.name : "unknown",
    typeof error?.code === "string" ? error.code : "",
  );
  if (error?.code === "SERVER_ERROR" || error?.code?.startsWith("SQL")) {
    const detail = String(error.message || "")
      .replace(/(?:https?|libsql):\/\/[^\s]+/g, "[provider]")
      .replace(/[A-Za-z0-9_.-]{40,}/g, "[redacted]")
      .replace(
        /(?:token|password|authorization)\s*[:=]\s*[^\s,;]+/gi,
        "[credential redacted]",
      )
      .slice(0, 400);
    console.error(
      "Database diagnostic:",
      detail,
      "statement",
      Number.isInteger(error.statementIndex) ? error.statementIndex : "unknown",
    );
  }
  process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  database?.close();
  client?.close();
}
