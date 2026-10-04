import { Router } from "express";
import { z } from "zod";
import { row, rows, run, now, transaction } from "./db.js";
import { requireAuth, adminOnly } from "./auth.js";
import { id, fail, money, audit } from "./core.js";
export async function validateCoupon(
  code: string,
  userId: string,
  subtotal: number,
) {
  const coupon = await row(
    "SELECT * FROM coupons WHERE code=? AND active=1",
    code.trim().toUpperCase(),
  );
  if (!coupon) fail(400, "Coupon is invalid or disabled.", "INVALID_COUPON");
  const stamp = now();
  if (coupon!.starts_at > stamp || coupon!.expires_at < stamp)
    fail(400, "This coupon is outside its validity dates.", "INVALID_COUPON");
  if (coupon!.target_user_id && coupon!.target_user_id !== userId)
    fail(400, "This coupon is for a different customer.", "INVALID_COUPON");
  if (subtotal < coupon!.min_order)
    fail(
      400,
      `Minimum cart value is ₹${coupon!.min_order / 100}.`,
      "INVALID_COUPON",
    );
  const uses = (await row(
    "SELECT count(*) count FROM coupon_redemptions WHERE coupon_id=? AND state<>?",
    coupon!.id,
    "released",
  ))!.count;
  const userUses = (await row(
    "SELECT count(*) count FROM coupon_redemptions WHERE coupon_id=? AND user_id=? AND state<>?",
    coupon!.id,
    userId,
    "released",
  ))!.count;
  if (uses >= coupon!.max_uses || userUses >= coupon!.per_user_limit)
    fail(400, "Coupon usage limit reached.", "INVALID_COUPON");
  let discount =
    coupon!.kind === "percent"
      ? Math.floor((subtotal * coupon!.value) / 100)
      : coupon!.value;
  if (coupon!.max_discount !== null)
    discount = Math.min(discount, coupon!.max_discount);
  return { coupon: coupon!, discount: Math.min(subtotal, discount) };
}
export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/),
    title: z.string().trim().min(2).max(120),
    kind: z.enum(["percent", "fixed"]),
    value: z.number().positive().max(100000),
    minOrder: z.number().min(0).max(10000000).default(0),
    maxDiscount: z.number().positive().max(1000000).nullable().default(null),
    startsAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    maxUses: z.number().int().min(1).max(1000000).default(100),
    perUserLimit: z.number().int().min(1).max(1000).default(1),
    targetUserId: z.string().uuid().nullable().default(null),
    active: z.boolean().default(true),
  })
  .strict()
  .refine(
    (d) =>
      d.kind !== "percent" || (d.value <= 100 && Number.isInteger(d.value)),
    "Percentage must be a whole number from 1 to 100",
  )
  .refine(
    (d) => new Date(d.expiresAt) > new Date(d.startsAt),
    "Expiry must follow the start date",
  );
export const serializeCoupon = (c: Record<string, any>) => ({
  id: c.id,
  code: c.code,
  title: c.title,
  kind: c.kind,
  value: c.value,
  minOrder: c.min_order,
  maxDiscount: c.max_discount,
  startsAt: c.starts_at,
  expiresAt: c.expires_at,
  maxUses: c.max_uses,
  perUserLimit: c.per_user_limit,
  targetUserId: c.target_user_id,
  active: !!c.active,
  uses: c.uses || 0,
});
export const rewardsRouter = Router();
rewardsRouter.use(requireAuth);
rewardsRouter.get("/", async (req, res) => {
  const coupons = (
    await rows(
      `SELECT c.*, (SELECT count(*) FROM coupon_redemptions r WHERE r.coupon_id=c.id AND r.state<>'released') uses FROM coupons c WHERE c.active=1 AND c.starts_at<=? AND c.expires_at>=? AND (c.target_user_id IS NULL OR c.target_user_id=?) AND (SELECT count(*) FROM coupon_redemptions r WHERE r.coupon_id=c.id AND r.user_id=? AND r.state<>'released')<c.per_user_limit ORDER BY c.created_at DESC`,
      now(),
      now(),
      req.user.id,
      req.user.id,
    )
  ).filter((c) => c.uses < c.max_uses);
  res.json({
    points: req.user.points,
    coupons: coupons.map(serializeCoupon),
    ledger: await rows(
      "SELECT id,amount,reason,created_at createdAt FROM point_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 40",
      req.user.id,
    ),
  });
});
export const adminCouponsRouter = Router();
adminCouponsRouter.use(requireAuth, adminOnly);
adminCouponsRouter.get("/", async (_req, res) =>
  res.json({
    coupons: (
      await rows(
        `SELECT c.*,(SELECT count(*) FROM coupon_redemptions r WHERE r.coupon_id=c.id AND r.state<>'released') uses FROM coupons c ORDER BY c.created_at DESC`,
      )
    ).map(serializeCoupon),
  }),
);
adminCouponsRouter.post("/", async (req, res) => {
  const c = couponSchema.parse(req.body),
    cid = id();
  await transaction(async () => {
    if (await row("SELECT id FROM coupons WHERE code=?", c.code))
      fail(409, "Coupon code already exists.");
    if (
      c.targetUserId &&
      !(await row(
        "SELECT id FROM users WHERE id=? AND role=? AND deleted_at IS NULL",
        c.targetUserId,
        "customer",
      ))
    )
      fail(400, "Customer not found.");
    await run(
      "INSERT INTO coupons VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      cid,
      c.code,
      c.title,
      c.kind,
      c.kind === "fixed" ? money(c.value) : c.value,
      money(c.minOrder),
      c.maxDiscount === null ? null : money(c.maxDiscount),
      new Date(c.startsAt).toISOString(),
      new Date(c.expiresAt).toISOString(),
      c.maxUses,
      c.perUserLimit,
      c.targetUserId,
      c.active ? 1 : 0,
      now(),
    );
    await audit(req.user.id, "coupon.create", cid);
  });
  res.status(201).json({
    coupon: serializeCoupon(
      (await row("SELECT * FROM coupons WHERE id=?", cid))!,
    ),
  });
});
adminCouponsRouter.patch("/:id", async (req, res) => {
  const { active } = z.object({ active: z.boolean() }).strict().parse(req.body),
    cid = String(req.params.id);
  if (!(await row("SELECT id FROM coupons WHERE id=?", cid)))
    fail(404, "Coupon not found.");
  await run("UPDATE coupons SET active=? WHERE id=?", active ? 1 : 0, cid);
  await audit(req.user.id, "coupon.toggle", cid, { active });
  res.json({ ok: true });
});
