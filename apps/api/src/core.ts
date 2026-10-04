import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { run, now } from "./db.js";
export const id = () => randomUUID();
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "BAD_REQUEST",
    public details?: unknown,
  ) {
    super(message);
  }
}
export const fail = (status: number, message: string, code?: string): never => {
  throw new AppError(status, message, code);
};
export const phone = z
  .string()
  .transform((v) => v.replace(/[\s()-]/g, "").replace(/^\+91/, ""))
  .pipe(
    z
      .string()
      .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  );
export const password = z
  .string()
  .min(8, "Password must have at least 8 characters")
  .max(72, "Password must be 72 characters or fewer")
  .refine(
    (v) => Buffer.byteLength(v) <= 72,
    "Password must be 72 bytes or fewer",
  );
export const money = (value: number) => Math.round(value * 100);
export const rupees = (paise: number) => paise / 100;
export function audit(
  actor: string,
  action: string,
  entity?: string,
  detail: unknown = {},
) {
  run(
    "INSERT INTO audit_log VALUES(?,?,?,?,?,?)",
    id(),
    actor,
    action,
    entity || null,
    JSON.stringify(detail),
    now(),
  );
}
export function page(q: Record<string, any>) {
  return z.object({limit:z.coerce.number().int().min(1).max(100).default(30),offset:z.coerce.number().int().min(0).max(1000000).default(0)}).parse({limit:q.limit,offset:q.offset});
}
export function escapeLike(v: string) {
  return v.replace(/[\\%_]/g, (c) => "\\" + c);
}
export function isoDate(s: string) {
  return z.iso.datetime({ offset: true }).parse(s);
}
