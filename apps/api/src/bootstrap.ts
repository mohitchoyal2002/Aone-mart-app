import bcrypt from "bcryptjs";
import { z } from "zod";
import { row, run, now } from "./db.js";
import { id, phone } from "./core.js";
const adminPhone = phone.parse(process.env.ADMIN_PHONE),
  adminPassword = z.string().min(12).max(72).parse(process.env.ADMIN_PASSWORD);
if (adminPassword === "replace_with_a_unique_password")
  throw new Error("Set a unique ADMIN_PASSWORD before bootstrapping.");
const existingAdmin = row(
  "SELECT id,role,deleted_at FROM users WHERE phone=?",
  adminPhone,
);
if (existingAdmin) {
  if (existingAdmin.role !== "admin" || existingAdmin.deleted_at) {
    throw new Error(
      "ADMIN_PHONE belongs to a disabled or customer account. Configure an active admin phone.",
    );
  }
  console.log("Admin phone already exists. Existing credentials retained.");
  process.exit(0);
}
run(
  "INSERT INTO users(id,name,phone,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
  id(),
  process.env.ADMIN_NAME || "Aone Mart Admin",
  adminPhone,
  await bcrypt.hash(adminPassword, 12),
  "admin",
  now(),
  now(),
);
console.log(
  `Admin created for phone ${adminPhone}. Password comes from the private backend .env file.`,
);
