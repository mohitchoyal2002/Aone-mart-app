import { Router } from "express";
import { z } from "zod";
import { row, rows, run, transaction, now, storeSettings } from "./db.js";
import { requireAuth, adminOnly, type User } from "./auth.js";
import { id, hash, fail, page, audit } from "./core.js";
import { validateCoupon } from "./coupons.js";
import {
  queueNotification,
  notifyAdmins,
  publishPending,
} from "./notifications.js";
const cartSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            quantity: z.number().int().min(1).max(999),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    couponCode: z.string().trim().max(30).default(""),
    redeemPoints: z.number().int().min(0).max(1000000).default(0),
    notes: z.string().trim().max(500).default(""),
    expectedTotal: z.number().int().min(0).max(100000000000).optional(),
  })
  .strict();
type Cart = z.infer<typeof cartSchema>;
export async function calculateCart(input: Cart, user: User) {
  if (new Set(input.items.map((x) => x.productId)).size !== input.items.length)
    fail(400, "Each product can appear only once in a cart.");
  const products: Array<
    Record<string, any> & {
      quantity: number;
      lineTotal: number;
    }
  > = await Promise.all(
    input.items.map(async (item) => {
      const product = await row(
        "SELECT * FROM products WHERE id=? AND deleted_at IS NULL",
        item.productId,
      );
      if (!product)
        fail(
          409,
          "A product is no longer available. Refresh your cart.",
          "PRODUCT_UNAVAILABLE",
        );
      if (product!.stock - product!.reserved < item.quantity)
        fail(
          409,
          `${product!.name}: only ${product!.stock - product!.reserved} units are available.`,
          "OUT_OF_STOCK",
        );
      return {
        ...product!,
        quantity: item.quantity,
        lineTotal: product!.price * item.quantity,
      };
    }),
  );
  const subtotal = products.reduce((s, p) => s + p.lineTotal, 0);
  let coupon: Record<string, any> | undefined,
    couponDiscount = 0;
  if (input.couponCode) {
    const valid = await validateCoupon(input.couponCode, user.id, subtotal);
    coupon = valid.coupon;
    couponDiscount = valid.discount;
  }
  const pointsBalance =
    (
      await row(
        "SELECT points FROM users WHERE id=? AND deleted_at IS NULL",
        user.id,
      )
    )?.points || 0;
  if (input.redeemPoints > pointsBalance)
    fail(
      400,
      "Not enough reward points. Refresh your balance.",
      "INSUFFICIENT_POINTS",
    );
  const pointsSpent = Math.min(
    input.redeemPoints,
    Math.floor((subtotal - couponDiscount) / 100),
  );
  return {
    products,
    subtotal,
    coupon,
    couponDiscount,
    pointsSpent,
    pointsDiscount: pointsSpent * 100,
    total: subtotal - couponDiscount - pointsSpent * 100,
  };
}
const serializeQuote = (q: Awaited<ReturnType<typeof calculateCart>>) => ({
  subtotal: q.subtotal,
  couponDiscount: q.couponDiscount,
  pointsSpent: q.pointsSpent,
  pointsDiscount: q.pointsDiscount,
  total: q.total,
  couponCode: q.coupon?.code || null,
  items: q.products.map((p) => ({
    productId: p.id,
    name: p.name,
    quantity: p.quantity,
    unitPrice: p.price,
    lineTotal: p.lineTotal,
  })),
});
export async function getOrder(oid: string, admin = false) {
  const o = await row(
    "SELECT o.*,u.name customer_name,u.phone customer_phone FROM orders o JOIN users u ON o.user_id=u.id WHERE o.id=?",
    oid,
  );
  if (!o) fail(404, "Order not found.");
  return {
    id: o!.id,
    number: o!.number,
    userId: o!.user_id,
    status: o!.status,
    subtotal: o!.subtotal,
    couponDiscount: o!.coupon_discount,
    pointsSpent: o!.points_spent,
    total: o!.total,
    pointsEarned: o!.points_earned,
    pickupCode: o!.pickup_code,
    notes: o!.notes,
    rejectionReason: o!.rejection_reason,
    createdAt: o!.created_at,
    updatedAt: o!.updated_at,
    ...(admin
      ? { customer: { name: o!.customer_name, phone: o!.customer_phone } }
      : {}),
    items: await rows(
      "SELECT product_id productId,sku,name,unit,image_url imageUrl,artwork,quantity,unit_price unitPrice,line_total lineTotal FROM order_items WHERE order_id=?",
      oid,
    ),
    events: await rows(
      "SELECT status,created_at createdAt FROM order_events WHERE order_id=? ORDER BY created_at",
      oid,
    ),
  };
}
function orderNumber() {
  return `AM-${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "")}-${id().slice(0, 8).toUpperCase()}`;
}
export async function createOrder(input: Cart, user: User, key: string) {
  const normalized = {
    ...input,
    couponCode: input.couponCode.toUpperCase(),
    items: [...input.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    ),
  };
  // A fresh quote may change after a successful request loses its response.
  // Retry identity describes the cart, while expectedTotal guards new orders.
  const { expectedTotal: _expectedTotal, ...identity } = normalized;
  const fingerprint = hash(JSON.stringify(identity));
  return await transaction(async () => {
    const existing = await row(
      "SELECT id,payload_hash FROM orders WHERE user_id=? AND idempotency_key=?",
      user.id,
      key,
    );
    if (existing) {
      if (existing.payload_hash !== fingerprint)
        fail(
          409,
          "This request key belongs to a different cart.",
          "IDEMPOTENCY_CONFLICT",
        );
      return { order: await getOrder(existing.id), created: false };
    }
    if (!(await storeSettings()).acceptingOrders)
      fail(409, "The mart is temporarily not accepting orders.");
    const quote = await calculateCart(normalized, user),
      oid = id(),
      stamp = now(),
      number = orderNumber();
    if (
      input.expectedTotal !== undefined &&
      quote.total !== input.expectedTotal
    )
      fail(
        409,
        "The basket price changed. Review the updated total before placing your order.",
        "PRICE_CHANGED",
      );
    for (const p of quote.products) {
      const changed = await run(
        "UPDATE products SET reserved=reserved+?,updated_at=? WHERE id=? AND stock-reserved>=?",
        p.quantity,
        stamp,
        p.id,
        p.quantity,
      );
      if (Number(changed.changes) !== 1)
        fail(
          409,
          `Stock changed for ${p.name}. Refresh your cart.`,
          "OUT_OF_STOCK",
        );
    }
    await run(
      "INSERT INTO orders(id,number,user_id,status,subtotal,coupon_discount,points_spent,total,coupon_id,pickup_code,notes,idempotency_key,payload_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      oid,
      number,
      user.id,
      "placed",
      quote.subtotal,
      quote.couponDiscount,
      quote.pointsSpent,
      quote.total,
      quote.coupon?.id || null,
      String(Math.floor(1000 + Math.random() * 9000)),
      input.notes,
      key,
      fingerprint,
      stamp,
      stamp,
    );
    for (const p of quote.products)
      await run(
        "INSERT INTO order_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        id(),
        oid,
        p.id,
        p.sku,
        p.name,
        p.unit,
        p.image_url,
        p.artwork,
        p.quantity,
        p.price,
        p.cost,
        p.lineTotal,
      );
    await run(
      "INSERT INTO order_events VALUES(?,?,?,?,?)",
      id(),
      oid,
      "placed",
      user.id,
      stamp,
    );
    if (quote.coupon)
      await run(
        "INSERT INTO coupon_redemptions VALUES(?,?,?,?,?,?)",
        id(),
        quote.coupon.id,
        user.id,
        oid,
        "reserved",
        stamp,
      );
    if (quote.pointsSpent) {
      await run(
        "UPDATE users SET points=points-? WHERE id=? AND points>=?",
        quote.pointsSpent,
        user.id,
        quote.pointsSpent,
      );
      await run(
        "INSERT INTO point_ledger VALUES(?,?,?,?,?,?)",
        id(),
        user.id,
        -quote.pointsSpent,
        "redeemed",
        oid,
        stamp,
      );
    }
    await notifyAdmins(
      "New pickup order",
      `${user.name} placed ${number} · ₹${(quote.total / 100).toFixed(2)}`,
      { orderId: oid, status: "placed", screen: "orders" },
    );
    return { order: await getOrder(oid), created: true };
  });
}
export async function transitionOrder(
  oid: string,
  status: string,
  actor: User,
  reason = "",
) {
  return await transaction(async () => {
    const order = await row("SELECT * FROM orders WHERE id=?", oid);
    if (!order) fail(404, "Order not found.");
    if (actor.role === "customer" && order!.user_id !== actor.id)
      fail(404, "Order not found.");
    if (order!.status === status)
      return await getOrder(oid, actor.role === "admin");
    const allowed =
      actor.role === "admin"
        ? (
            {
              accepted: ["placed"],
              packed: ["accepted"],
              rejected: ["placed", "accepted", "packed"],
              picked: ["packed"],
            } as Record<string, string[]>
          )[status]
        : (
            { cancelled: ["placed"], picked: ["packed"] } as Record<
              string,
              string[]
            >
          )[status];
    if (!allowed?.includes(order!.status))
      fail(
        409,
        `Cannot change ${order!.status} to ${status}. Refresh the order.`,
        "INVALID_ORDER_TRANSITION",
      );
    if (status === "rejected" && !reason.trim())
      fail(
        400,
        "Enter a reason so the customer knows why the order was rejected.",
      );
    const stamp = now();
    if (status === "rejected" || status === "cancelled") {
      for (const p of await rows(
        "SELECT * FROM order_items WHERE order_id=?",
        oid,
      ))
        await run(
          "UPDATE products SET reserved=reserved-?,updated_at=? WHERE id=?",
          p.quantity,
          stamp,
          p.product_id,
        );
      await run(
        "UPDATE coupon_redemptions SET state=? WHERE order_id=?",
        "released",
        oid,
      );
      if (order!.points_spent) {
        await run(
          "UPDATE users SET points=points+? WHERE id=?",
          order!.points_spent,
          order!.user_id,
        );
        await run(
          "INSERT INTO point_ledger VALUES(?,?,?,?,?,?)",
          id(),
          order!.user_id,
          order!.points_spent,
          "refunded",
          oid,
          stamp,
        );
      }
    }
    if (status === "picked") {
      const invoiceId = id();
      await run(
        "INSERT INTO invoices VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        invoiceId,
        `INV-${order!.number}`,
        oid,
        order!.user_id,
        null,
        stamp,
        order!.subtotal,
        order!.coupon_discount + order!.points_spent * 100,
        order!.total,
        "pickup",
        stamp,
      );
      for (const p of await rows(
        "SELECT oi.*,c.name category FROM order_items oi JOIN products pr ON pr.id=oi.product_id JOIN categories c ON c.id=pr.category_id WHERE oi.order_id=?",
        oid,
      )) {
        await run(
          "UPDATE products SET stock=stock-?,reserved=reserved-?,updated_at=? WHERE id=?",
          p.quantity,
          p.quantity,
          stamp,
          p.product_id,
        );
        await run(
          "INSERT INTO inventory_movements VALUES(?,?,?,?,?,?,?)",
          id(),
          p.product_id,
          -p.quantity,
          "pickup",
          oid,
          actor.id,
          stamp,
        );
        await run(
          "INSERT INTO invoice_items VALUES(?,?,?,?,?,?,?,?,?,?)",
          id(),
          invoiceId,
          p.product_id,
          p.sku,
          p.name,
          p.category,
          p.quantity,
          p.unit_price,
          p.unit_cost,
          p.line_total,
        );
      }
      const rate = (await storeSettings()).pointsPer100Rupees || 0,
        earned = Math.floor(order!.total / 10000) * rate;
      if (earned) {
        await run(
          "UPDATE users SET points=points+? WHERE id=?",
          earned,
          order!.user_id,
        );
        await run(
          "INSERT INTO point_ledger VALUES(?,?,?,?,?,?)",
          id(),
          order!.user_id,
          earned,
          "earned",
          oid,
          stamp,
        );
      }
      await run("UPDATE orders SET points_earned=? WHERE id=?", earned, oid);
      await run(
        "UPDATE coupon_redemptions SET state=? WHERE order_id=?",
        "redeemed",
        oid,
      );
    }
    await run(
      "UPDATE orders SET status=?,updated_at=?,rejection_reason=? WHERE id=?",
      status,
      stamp,
      status === "rejected" ? reason : null,
      oid,
    );
    await run(
      "INSERT INTO order_events VALUES(?,?,?,?,?)",
      id(),
      oid,
      status,
      actor.id,
      stamp,
    );
    await audit(actor.id, `order.${status}`, oid);
    const messages: Record<string, [string, string]> = {
      accepted: ["Order accepted", `We're getting ${order!.number} ready.`],
      packed: [
        "Ready for pickup",
        `${order!.number} is packed. Visit the mart and show code ${order!.pickup_code}.`,
      ],
      rejected: ["Order rejected", reason],
      picked: [
        "Thanks for shopping!",
        `${order!.number} was picked up. Your rewards have been updated.`,
      ],
    };
    if (messages[status])
      await queueNotification(order!.user_id, ...messages[status], {
        orderId: oid,
        status,
        screen: "orders",
      });
    if (actor.role === "customer")
      await notifyAdmins(
        status === "picked" ? "Order picked up" : "Order cancelled",
        order!.number,
        { orderId: oid, status, screen: "orders" },
      );
    return await getOrder(oid, actor.role === "admin");
  });
}
export const ordersRouter = Router();
ordersRouter.use(requireAuth);
ordersRouter.post("/quote", async (req, res) => {
  if (req.user.role !== "customer") fail(403, "Customer access required.");
  res.json({
    quote: serializeQuote(
      await calculateCart(cartSchema.parse(req.body), req.user),
    ),
  });
});
ordersRouter.post("/", async (req, res) => {
  if (req.user.role !== "customer") fail(403, "Customer access required.");
  const key = z.string().min(16).max(100).parse(req.headers["idempotency-key"]);
  const result = await createOrder(cartSchema.parse(req.body), req.user, key);
  await publishPending();
  res.status(result.created ? 201 : 200).json(result);
});
ordersRouter.get("/", async (req, res) => {
  const { limit, offset } = page(req.query);
  const status = z
    .enum(["active", "past", "all"])
    .default("all")
    .parse(req.query.status);
  const clause =
    status === "active"
      ? "status IN ('placed','accepted','packed')"
      : status === "past"
        ? "status IN ('picked','rejected','cancelled')"
        : "1=1";
  const result = await rows(
    `SELECT id FROM orders WHERE user_id=? AND ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    req.user.id,
    limit,
    offset,
  );
  res.json({
    orders: await Promise.all(result.map(async (o) => await getOrder(o.id))),
    total: (await row(
      `SELECT count(*) count FROM orders WHERE user_id=? AND ${clause}`,
      req.user.id,
    ))!.count,
    limit,
    offset,
  });
});
ordersRouter.get("/:id", async (req, res) => {
  const o = await row(
    "SELECT user_id FROM orders WHERE id=?",
    String(req.params.id),
  );
  if (!o || o.user_id !== req.user.id) fail(404, "Order not found.");
  res.json({ order: await getOrder(String(req.params.id)) });
});
ordersRouter.patch("/:id/status", async (req, res) => {
  const d = z
    .object({ status: z.enum(["picked", "cancelled"]) })
    .strict()
    .parse(req.body);
  const order = await transitionOrder(
    String(req.params.id),
    d.status,
    req.user,
  );
  await publishPending();
  res.json({ order });
});
export const adminOrdersRouter = Router();
adminOrdersRouter.use(requireAuth, adminOnly);
adminOrdersRouter.get("/", async (req, res) => {
  const { limit, offset } = page(req.query),
    status = String(req.query.status || "active");
  const clause =
    status === "active"
      ? "status IN ('placed','accepted','packed')"
      : status === "all"
        ? "1=1"
        : "status=?";
  if (
    ![
      "active",
      "all",
      "placed",
      "accepted",
      "packed",
      "picked",
      "rejected",
      "cancelled",
    ].includes(status)
  )
    fail(400, "Unknown status filter.");
  const args = status === "active" || status === "all" ? [] : [status];
  res.json({
    orders: await Promise.all(
      (
        await rows(
          `SELECT id FROM orders WHERE ${clause} ORDER BY CASE status WHEN 'placed' THEN 0 WHEN 'accepted' THEN 1 WHEN 'packed' THEN 2 ELSE 3 END,created_at DESC LIMIT ? OFFSET ?`,
          ...args,
          limit,
          offset,
        )
      ).map(async (o) => await getOrder(o.id, true)),
    ),
    total: (await row(
      `SELECT count(*) count FROM orders WHERE ${clause}`,
      ...args,
    ))!.count,
    limit,
    offset,
  });
});
adminOrdersRouter.patch("/:id/status", async (req, res) => {
  const d = z
    .object({
      status: z.enum(["accepted", "packed", "rejected", "picked"]),
      reason: z.string().trim().max(300).default(""),
    })
    .strict()
    .parse(req.body);
  const order = await transitionOrder(
    String(req.params.id),
    d.status,
    req.user,
    d.reason,
  );
  await publishPending();
  res.json({ order });
});
