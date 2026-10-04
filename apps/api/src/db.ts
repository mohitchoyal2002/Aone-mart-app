import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Transaction } from "@libsql/client/http";
import { config } from "./config.js";
import { schemaSQL, schemaVersion } from "./schema.js";

export const defaultStore = {
  name: "Aone Mart",
  tagline: "Your neighbourhood, in your pocket.",
  address: "",
  phone: "",
  hours: "9 AM – 9 PM",
  pickupInstructions: "Show your pickup code at the counter. Pay at the mart.",
  mapsUrl: "https://share.google/i8QcM88QoSkxQIs5N",
  pointsPer100Rupees: 1,
  acceptingOrders: true,
};
const remote = config.tursoUrl
  ? createClient({
      url: config.tursoUrl,
      authToken: config.tursoToken,
      intMode: "number",
    })
  : undefined;
let local: DatabaseSync | undefined;
if (!remote) {
  if (config.dbPath !== ":memory:")
    mkdirSync(dirname(config.dbPath), { recursive: true });
  local = new DatabaseSync(config.dbPath);
  local.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  local.exec(schemaSQL);
  local
    .prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)")
    .run("store", JSON.stringify(defaultStore));
}
type Scope = { transaction?: Transaction };
const scope = new AsyncLocalStorage<Scope>();
let ready: Promise<void> | undefined;
let localTail: Promise<void> = Promise.resolve();
async function locked<T>(fn: () => T | Promise<T>): Promise<T> {
  if (!local || scope.getStore()) return await fn();
  const previous = localTail;
  let release!: () => void;
  localTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}
export async function initializeDatabase(): Promise<void> {
  if (!remote) return;
  if (!ready) {
    ready = remote
      .execute({sql: "SELECT value FROM settings WHERE key=?", args:["schemaVersion"]})
      .then((result) => {
        if (Number(result.rows[0]?.[0]) !== schemaVersion)
          throw new Error(
            "Permanent database migration is required before serving traffic.",
          );
      })
      .catch((error) => {
        ready = undefined;
        throw error;
      });
  }
  await ready;
}
const argumentsForRemote = (args: SQLInputValue[]) =>
  args.map((value) =>
    ArrayBuffer.isView(value)
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      : value,
  );
async function query(sql: string, args: SQLInputValue[]) {
  await initializeDatabase();
  const connection = scope.getStore()?.transaction || remote!;
  const result = await connection.execute({
    sql,
    args: argumentsForRemote(args),
  });
  return result.rows.map((value) =>
    Object.fromEntries(
      result.columns.map((name, index) => [name, value[index]]),
    ),
  );
}
export async function row<T = Record<string, any>>(
  sql: string,
  ...args: SQLInputValue[]
): Promise<T | undefined> {
  return await locked(async () =>
    local
      ? (local.prepare(sql).get(...args) as T | undefined)
      : ((await query(sql, args))[0] as T | undefined),
  );
}
export async function rows<T = Record<string, any>>(
  sql: string,
  ...args: SQLInputValue[]
): Promise<T[]> {
  return await locked(async () =>
    local
      ? (local.prepare(sql).all(...args) as T[])
      : ((await query(sql, args)) as T[]),
  );
}
export async function run(sql: string, ...args: SQLInputValue[]) {
  return await locked(async () => {
    if (local) return local.prepare(sql).run(...args);
    await initializeDatabase();
    const result = await (scope.getStore()?.transaction || remote!).execute({
      sql,
      args: argumentsForRemote(args),
    });
    return {
      changes: result.rowsAffected,
      lastInsertRowid: result.lastInsertRowid ?? 0n,
    };
  });
}
export type Statement = { sql: string; args: SQLInputValue[] };
export async function batchRun(statements: Statement[]) {
  if (!scope.getStore())
    throw new Error("Batch writes require a database transaction.");
  if (local)
    return statements.map(({ sql, args }) => local!.prepare(sql).run(...args));
  const results = await scope
    .getStore()!
    .transaction!.batch(
      statements.map(({ sql, args }) => ({
        sql,
        args: argumentsForRemote(args),
      })),
    );
  return results.map((result) => ({
    changes: result.rowsAffected,
    lastInsertRowid: result.lastInsertRowid ?? 0n,
  }));
}
export async function transaction<T>(fn: () => T | Promise<T>): Promise<T> {
  if (scope.getStore())
    throw new Error("Nested database transactions are not supported.");
  await initializeDatabase();
  return await locked(async () => {
    const tx = remote ? await remote.transaction("write") : undefined;
    if (local) local.exec("BEGIN IMMEDIATE");
    try {
      const result = await scope.run({ transaction: tx }, fn);
      if (tx) await tx.commit();
      else local!.exec("COMMIT");
      return result;
    } catch (error) {
      if (tx) {
        if (!tx.closed) await tx.rollback();
      } else local!.exec("ROLLBACK");
      throw error;
    } finally {
      tx?.close();
    }
  });
}
export const db = {
  close() {
    local?.close();
    remote?.close();
  },
};
export const now = () => new Date().toISOString();
export const storeSettings = async () =>
  JSON.parse(
    (await row("SELECT value FROM settings WHERE key=?", "store"))?.value ||
      "{}",
  );
