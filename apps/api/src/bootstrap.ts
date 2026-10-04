import bcrypt from "bcryptjs";
import { z } from "zod";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { row, run, now, transaction, db } from "./db.js";
import { id, phone } from "./core.js";

export async function bootstrapAdmin() {
  const adminPhone = phone.parse(process.env.ADMIN_PHONE);
  const adminPassword = z
    .string()
    .min(12)
    .max(72)
    .parse(process.env.ADMIN_PASSWORD);
  if (adminPassword === "replace_with_a_unique_password")
    throw new Error("Configure a unique administrator password.");
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  return await transaction(async () => {
    const existing = await row(
      "SELECT id,role,deleted_at FROM users WHERE phone=?",
      adminPhone,
    );
    if (existing) {
      if (existing.role !== "admin" || existing.deleted_at)
        throw new Error("Configured administrator phone is unavailable.");
      return { created: false };
    }
    await run(
      "INSERT INTO users(id,name,phone,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      id(),
      process.env.ADMIN_NAME || "Aone Mart Admin",
      adminPhone,
      passwordHash,
      "admin",
      now(),
      now(),
    );
    return { created: true };
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await bootstrapAdmin();
    console.log("Administrator ready. Existing credentials retained.");
  } finally {
    db.close();
  }
}
