import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { row, rows, run, transaction, now, storeSettings } from "./db.js";
import { requireAuth, adminOnly, publicUser, type User } from "./auth.js";
import { id, fail, phone, password, page, audit, escapeLike } from "./core.js";
export const usersRouter = Router();
usersRouter.use(requireAuth, adminOnly);
usersRouter.get("/", async (req, res) => {
  const { limit, offset } = page(req.query),
    q = escapeLike(String(req.query.q || "").slice(0, 100)),
    deleted = req.query.deleted === "true";
  const filter = `WHERE u.deleted_at IS ${deleted ? "NOT " : ""}NULL AND (u.name LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')`;
  const users = await rows(
    `SELECT u.*, (SELECT count(*) FROM orders o WHERE o.user_id=u.id) orders,(SELECT coalesce(sum(i.total),0) FROM invoices i WHERE i.user_id=u.id) spent FROM users u ${filter} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    `%${q}%`,
    `%${q}%`,
    limit,
    offset,
  );
  res.json({
    users: users.map((u) => ({
      ...publicUser(u as User),
      deletedAt: u.deleted_at,
      orders: u.orders,
      spent: u.spent,
    })),
    total: (await row(
      `SELECT count(*) count FROM users u ${filter}`,
      `%${q}%`,
      `%${q}%`,
    ))!.count,
    limit,
    offset,
  });
});
usersRouter.post("/", async (req, res) => {
  const d = z
    .object({
      name: z.string().trim().min(2).max(100),
      phone,
      password,
      role: z.enum(["admin", "customer"]).default("customer"),
    })
    .strict()
    .parse(req.body);
  const passwordHash = await bcrypt.hash(d.password, 12),
    uid = id();
  await transaction(async () => {
    if (await row("SELECT id FROM users WHERE phone=?", d.phone))
      fail(
        409,
        "Phone already belongs to an account, including disabled accounts.",
      );
    await run(
      "INSERT INTO users(id,name,phone,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      uid,
      d.name,
      d.phone,
      passwordHash,
      d.role,
      now(),
      now(),
    );
    await audit(req.user.id, "user.create", uid, { role: d.role });
  });
  res.status(201).json({
    user: publicUser((await row<User>("SELECT * FROM users WHERE id=?", uid))!),
  });
});
usersRouter.patch("/:id", async (req, res) => {
  const uid = String(req.params.id);
  const d = z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      phone: phone.optional(),
      password: password.optional(),
      role: z.enum(["admin", "customer"]).optional(),
      points: z.number().int().min(0).max(1000000).optional(),
      pointReason: z.string().trim().min(3).max(200).optional(),
    })
    .strict()
    .parse(req.body);
  const passwordHash = d.password
    ? await bcrypt.hash(d.password, 12)
    : undefined;
  await transaction(async () => {
    const u = await row<User>(
      "SELECT * FROM users WHERE id=? AND deleted_at IS NULL",
      uid,
    );
    if (!u) fail(404, "Account not found.");
    if (uid === req.user.id && d.role && d.role !== "admin")
      fail(400, "You cannot remove your own admin access.");
    if (
      d.phone &&
      (await row("SELECT id FROM users WHERE phone=? AND id<>?", d.phone, uid))
    )
      fail(409, "Phone already belongs to another account.");
    if (
      d.role &&
      d.role !== u!.role &&
      (await row(
        "SELECT id FROM orders WHERE user_id=? AND status IN ('placed','accepted','packed')",
        uid,
      ))
    )
      fail(409, "Complete active orders before changing this account role.");
    if (d.points !== undefined && d.points !== u!.points && !d.pointReason)
      fail(400, "A reason is required to adjust reward points.");
    const revoked =
      !!passwordHash ||
      !!(d.role && d.role !== u!.role) ||
      !!(d.phone && d.phone !== u!.phone);
    await run(
      "UPDATE users SET name=?,phone=?,password_hash=?,role=?,points=?,auth_version=auth_version+?,updated_at=? WHERE id=?",
      d.name ?? u!.name,
      d.phone ?? u!.phone,
      passwordHash ?? u!.password_hash,
      d.role ?? u!.role,
      d.points ?? u!.points,
      revoked ? 1 : 0,
      now(),
      uid,
    );
    if (revoked) await run("DELETE FROM refresh_sessions WHERE user_id=?", uid);
    if (revoked) await run("DELETE FROM device_tokens WHERE user_id=?", uid);
    if (d.points !== undefined && d.points !== u!.points)
      await run(
        "INSERT INTO point_ledger VALUES(?,?,?,?,?,?)",
        id(),
        uid,
        d.points - u!.points,
        `admin: ${d.pointReason}`,
        null,
        now(),
      );
    await audit(req.user.id, "user.update", uid, {
      role: d.role,
      pointsChanged: d.points !== undefined,
    });
  });
  res.json({
    user: publicUser((await row<User>("SELECT * FROM users WHERE id=?", uid))!),
  });
});
usersRouter.delete("/:id", async (req, res) => {
  const uid = String(req.params.id);
  await transaction(async () => {
    const u = await row<User>(
      "SELECT * FROM users WHERE id=? AND deleted_at IS NULL",
      uid,
    );
    if (!u) fail(404, "Account not found.");
    if (uid === req.user.id) fail(400, "You cannot disable your own account.");
    if (
      await row(
        "SELECT id FROM orders WHERE user_id=? AND status IN ('placed','accepted','packed')",
        uid,
      )
    )
      fail(
        409,
        "Complete or reject this customer’s active orders before disabling their account.",
      );
    await run(
      "UPDATE users SET deleted_at=?,auth_version=auth_version+1,updated_at=? WHERE id=?",
      now(),
      now(),
      uid,
    );
    await run("DELETE FROM refresh_sessions WHERE user_id=?", uid);
    await run("DELETE FROM device_tokens WHERE user_id=?", uid);
    await audit(req.user.id, "user.soft_delete", uid);
  });
  res.json({ ok: true });
});
usersRouter.post("/:id/restore", async (req, res) => {
  const uid = String(req.params.id);
  if (
    !(await row(
      "SELECT id FROM users WHERE id=? AND deleted_at IS NOT NULL",
      uid,
    ))
  )
    fail(404, "Disabled account not found.");
  await run(
    "UPDATE users SET deleted_at=NULL,auth_version=auth_version+1,updated_at=? WHERE id=?",
    now(),
    uid,
  );
  await audit(req.user.id, "user.restore", uid);
  res.json({ ok: true });
});
export const settingsRouter = Router();
settingsRouter.use(requireAuth, adminOnly);
settingsRouter.get("/", async (_req, res) =>
  res.json({
    store: {
      ...(await storeSettings()),
      demoCatalog:
        (await row("SELECT value FROM settings WHERE key=?", "demoCatalog"))
          ?.value === "true",
    },
    aiConfigured: !!process.env.GEMINI_API_KEY,
    push: {
      registeredDevices: (await row(
        "SELECT count(*) count FROM device_tokens WHERE active=1",
      ))!.count,
      failedNotifications: (await row(
        "SELECT count(*) count FROM notification_outbox WHERE sent_at IS NULL AND attempts>=6",
      ))!.count,
    },
  }),
);
settingsRouter.put("/", async (req, res) => {
  const s = z
    .object({
      name: z.string().trim().min(2).max(100),
      tagline: z.string().max(160),
      address: z.string().max(300),
      phone: z.union([phone, z.literal("")]),
      hours: z.string().max(100),
      pickupInstructions: z.string().max(500),
      mapsUrl: z.union([
        z.literal(""),
        z.url().refine((v) => v.startsWith("https://")),
      ]),
      pointsPer100Rupees: z.number().int().min(0).max(100),
      acceptingOrders: z.boolean(),
      demoCatalog: z.boolean().default(false),
    })
    .strict()
    .parse(req.body);
  await transaction(async () => {
    const { demoCatalog, ...details } = s;
    await run(
      "UPDATE settings SET value=? WHERE key=?",
      JSON.stringify(details),
      "store",
    );
    await run(
      "INSERT OR REPLACE INTO settings VALUES(?,?)",
      "demoCatalog",
      String(demoCatalog),
    );
    await audit(req.user.id, "settings.update");
  });
  res.json({ store: s });
});
settingsRouter.get("/audit", async (req, res) => {
  const { limit, offset } = page(req.query);
  res.json({
    entries: await rows(
      "SELECT a.*,u.name actor FROM audit_log a JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT ? OFFSET ?",
      limit,
      offset,
    ),
  });
});
