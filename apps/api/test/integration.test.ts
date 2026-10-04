import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = ":memory:";
process.env.JWT_SECRET =
  "integration-tests-only-random-secret-aaaaaaaaaaaaaaaaaaaa";
process.env.GEMINI_API_KEY = "test-key-never-sent-to-provider";
const { app } = await import("../src/app.js");
const { row, rows, run, now, db } = await import("../src/db.js");
let adminToken: string,
  customerToken: string,
  refreshToken: string,
  customerId: string,
  otherToken: string,
  otherId: string;
let categoryId: string, productId: string, orderId: string, couponId: string;
const adminId = randomUUID(),
  pass = "TestPassword!123";
const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
const cart = (quantity = 1) => ({
  items: [{ productId, quantity }],
  couponCode: "SAVE10",
  redeemPoints: 0,
});
const newCoupon = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  title: "Ten percent off",
  kind: "percent",
  value: 10,
  minOrder: 0,
  maxDiscount: null,
  startsAt: new Date(Date.now() - 60000).toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  maxUses: 100,
  perUserLimit: 1,
  targetUserId: null,
  active: true,
  ...extra,
});
before(async () => {
  run(
    "INSERT INTO users(id,name,phone,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    adminId,
    "Test Admin",
    "9999999999",
    await bcrypt.hash(pass, 4),
    "admin",
    now(),
    now(),
  );
  const admin = await request(app)
    .post("/api/auth/login")
    .send({ phone: "9999999999", password: pass, role: "admin" });
  assert.equal(admin.status, 200);
  adminToken = admin.body.accessToken;
  const customer = await request(app)
    .post("/api/auth/signup")
    .send({ name: "Test Customer", phone: "9876543210", password: pass });
  assert.equal(customer.status, 201);
  customerToken = customer.body.accessToken;
  refreshToken = customer.body.refreshToken;
  customerId = customer.body.user.id;
  const other = await request(app)
    .post("/api/auth/signup")
    .send({ name: "Other Customer", phone: "+91 9876543211", password: pass });
  otherToken = other.body.accessToken;
  otherId = other.body.user.id;
  const cat = await request(app)
    .post("/api/admin/inventory/categories")
    .set(auth())
    .send({ name: "Groceries" });
  categoryId = cat.body.category.id;
  const p = await request(app).post("/api/admin/inventory").set(auth()).send({
    sku: "RICE",
    name: "Rice",
    categoryId,
    price: 500,
    mrp: 550,
    cost: 400,
    stock: 20,
    unit: "5 kg",
  });
  assert.equal(p.status, 201);
  productId = p.body.product.id;
  const c = await request(app)
    .post("/api/admin/coupons")
    .set(auth())
    .send(newCoupon("SAVE10"));
  assert.equal(c.status, 201);
  couponId = c.body.coupon.id;
});
after(() => db.close());
test("admin endpoints reject missing credentials and customer roles", async () => {
  assert.equal((await request(app).get("/api/admin/users")).status, 401);
  assert.equal(
    (await request(app).get("/api/admin/users").set(auth(customerToken)))
      .status,
    403,
  );
  const bad = await request(app).post("/api/auth/signup").send({
    name: "Evil Role",
    phone: "9876543212",
    password: pass,
    role: "admin",
  });
  assert.equal(bad.status, 422);
  assert.equal(
    (
      await request(app)
        .post("/api/auth/login")
        .send({ phone: "9876543210", password: pass, role: "admin" })
    ).status,
    401,
  );
});
test("catalog conceals costs and supports search", async () => {
  const r = await request(app)
    .get("/api/catalog/products?q=Rice")
    .set(auth(customerToken));
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 1);
  assert.equal(r.body.products[0].price, 50000);
  assert.equal("cost" in r.body.products[0], false);
});
test("quote does not reserve stock; order reserves once with idempotent retries", async () => {
  const q = await request(app)
    .post("/api/orders/quote")
    .set(auth(customerToken))
    .send(cart(2));
  assert.equal(q.status, 200);
  assert.equal(q.body.quote.total, 90000);
  assert.equal(
    row("SELECT reserved FROM products WHERE id=?", productId)!.reserved,
    0,
  );
  const key = randomUUID();
  const r = await request(app)
    .post("/api/orders")
    .set(auth(customerToken))
    .set("Idempotency-Key", key)
    .send(cart(2));
  assert.equal(r.status, 201);
  orderId = r.body.order.id;
  assert.equal(
    row("SELECT reserved FROM products WHERE id=?", productId)!.reserved,
    2,
  );
  const retry = await request(app)
    .post("/api/orders")
    .set(auth(customerToken))
    .set("Idempotency-Key", key)
    .send(cart(2));
  assert.equal(retry.status, 200);
  assert.equal(retry.body.order.id, orderId);
  assert.equal(
    row("SELECT reserved FROM products WHERE id=?", productId)!.reserved,
    2,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/orders")
        .set(auth(customerToken))
        .set("Idempotency-Key", key)
        .send(cart(3))
    ).status,
    409,
  );
});
test("coupon reservation enforces usage limits; stock edits protect reservations", async () => {
  const r = await request(app)
    .post("/api/orders/quote")
    .set(auth(customerToken))
    .send(cart());
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "INVALID_COUPON");
  const edit = await request(app)
    .put(`/api/admin/inventory/${productId}`)
    .set(auth())
    .send({
      sku: "RICE",
      name: "Rice",
      categoryId,
      price: 500,
      mrp: 550,
      cost: 400,
      stock: 1,
    });
  assert.equal(edit.status, 409);
  assert.equal(
    (await request(app).delete(`/api/admin/inventory/${productId}`).set(auth()))
      .status,
    409,
  );
  assert.equal(
    (await request(app).delete(`/api/admin/users/${customerId}`).set(auth()))
      .status,
    409,
  );
});
test("order states and ownership are enforced", async () => {
  assert.equal(
    (
      await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set(auth())
        .send({ status: "packed" })
    ).status,
    409,
  );
  assert.equal(
    (await request(app).get(`/api/orders/${orderId}`).set(auth(otherToken)))
      .status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(auth(otherToken))
        .send({ status: "picked" })
    ).status,
    404,
  );
});
test("pickup commits invoice, inventory and rewards exactly once", async () => {
  assert.equal(
    (
      await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set(auth())
        .send({ status: "accepted" })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set(auth())
        .send({ status: "packed" })
    ).status,
    200,
  );
  const picked = await request(app)
    .patch(`/api/orders/${orderId}/status`)
    .set(auth(customerToken))
    .send({ status: "picked" });
  assert.equal(picked.status, 200);
  assert.equal(picked.body.order.pointsEarned, 9);
  assert.deepEqual(
    row("SELECT stock,reserved FROM products WHERE id=?", productId),
    Object.assign(Object.create(null), { stock: 18, reserved: 0 }),
  );
  assert.equal(
    row("SELECT points FROM users WHERE id=?", customerId)!.points,
    9,
  );
  assert.equal(
    rows("SELECT * FROM invoices WHERE order_id=?", orderId).length,
    1,
  );
  assert.equal(
    (
      await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set(auth(customerToken))
        .send({ status: "picked" })
    ).status,
    200,
  );
  assert.equal(
    row("SELECT points FROM users WHERE id=?", customerId)!.points,
    9,
  );
  assert.equal(
    rows("SELECT * FROM invoices WHERE order_id=?", orderId).length,
    1,
  );
  const sales = await request(app).get("/api/admin/reports/sales").set(auth());
  assert.equal(sales.status, 200);
  assert.equal(sales.body.stats.revenue, 90000);
  assert.equal(sales.body.stats.profit, 10000);
});
test("rejecting refunds points and coupon and releases stock; requires rejection reason", async () => {
  const c = await request(app)
    .post("/api/admin/coupons")
    .set(auth())
    .send(newCoupon("REUSE10"));
  assert.equal(c.status, 201);
  const input = { ...cart(), couponCode: "REUSE10", redeemPoints: 5 };
  const placed = await request(app)
    .post("/api/orders")
    .set(auth(customerToken))
    .set("Idempotency-Key", randomUUID())
    .send(input);
  assert.equal(placed.status, 201);
  assert.equal(
    row("SELECT points FROM users WHERE id=?", customerId)!.points,
    4,
  );
  const oid = placed.body.order.id;
  assert.equal(
    (
      await request(app)
        .patch(`/api/admin/orders/${oid}/status`)
        .set(auth())
        .send({ status: "rejected" })
    ).status,
    400,
  );
  const rejected = await request(app)
    .patch(`/api/admin/orders/${oid}/status`)
    .set(auth())
    .send({ status: "rejected", reason: "Item unavailable" });
  assert.equal(rejected.status, 200);
  assert.equal(
    row("SELECT points FROM users WHERE id=?", customerId)!.points,
    9,
  );
  assert.equal(
    row("SELECT reserved FROM products WHERE id=?", productId)!.reserved,
    0,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/orders/quote")
        .set(auth(customerToken))
        .send(input)
    ).status,
    200,
  );
});
test("targeted coupons cannot be used by other customers", async () => {
  await request(app)
    .post("/api/admin/coupons")
    .set(auth())
    .send(newCoupon("ONLYONE", { targetUserId: customerId }));
  assert.equal(
    (
      await request(app)
        .post("/api/orders/quote")
        .set(auth(otherToken))
        .send({ ...cart(), couponCode: "ONLYONE" })
    ).status,
    400,
  );
  const r = await request(app).get("/api/rewards").set(auth(otherToken));
  assert.ok(
    !r.body.coupons.some((c: { code: string }) => c.code === "ONLYONE"),
  );
});
test("overselling and duplicate line items are rejected atomically", async () => {
  const r = await request(app)
    .post("/api/orders")
    .set(auth(otherToken))
    .set("Idempotency-Key", randomUUID())
    .send({ items: [{ productId, quantity: 19 }] });
  assert.equal(r.status, 409);
  assert.equal(
    row("SELECT reserved FROM products WHERE id=?", productId)!.reserved,
    0,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/orders/quote")
        .set(auth(otherToken))
        .send({
          items: [
            { productId, quantity: 1 },
            { productId, quantity: 1 },
          ],
        })
    ).status,
    400,
  );
});
test("CSV previews do not mutate data and commits are idempotent", async () => {
  const csv =
    "sku,name,category,price,mrp,cost,stock,unit\nSOAP,Soap,Daily Needs,40,50,30,20,100 g\n";
  const p = await request(app)
    .post("/api/admin/imports/preview")
    .set(auth())
    .field("type", "products")
    .attach("file", Buffer.from(csv), "products.csv");
  assert.equal(p.status, 201);
  assert.equal(p.body.preview.canCommit, true);
  assert.equal(row("SELECT id FROM products WHERE sku=?", "SOAP"), undefined);
  const cid = p.body.preview.id;
  assert.equal(
    (
      await request(app)
        .post(`/api/admin/imports/${cid}/commit`)
        .set(auth())
        .send({})
    ).status,
    200,
  );
  assert.ok(row("SELECT id FROM products WHERE sku=?", "SOAP"));
  const again = await request(app)
    .post(`/api/admin/imports/${cid}/commit`)
    .set(auth())
    .send({});
  assert.equal(again.body.alreadyCommitted, true);
  assert.equal(
    (
      await request(app)
        .post("/api/admin/imports/preview")
        .set(auth())
        .field("type", "products")
        .attach("file", Buffer.from(csv), "products.csv")
    ).status,
    409,
  );
});
test("invalid CSV rows and duplicate SKUs block the entire import", async () => {
  const csv =
    "sku,name,category,price,mrp,stock\nBAD,Invalid,Groceries,100,90,3\nBAD,Invalid,Groceries,100,110,3\n";
  const p = await request(app)
    .post("/api/admin/imports/preview")
    .set(auth())
    .field("type", "products")
    .attach("file", Buffer.from(csv), "bad.csv");
  assert.equal(p.status, 201);
  assert.equal(p.body.preview.canCommit, false);
  assert.equal(
    (
      await request(app)
        .post(`/api/admin/imports/${p.body.preview.id}/commit`)
        .set(auth())
        .send({})
    ).status,
    422,
  );
  assert.equal(row("SELECT id FROM products WHERE sku=?", "BAD"), undefined);
});
const posHeader = "NameToDisplay,Barcode,MRP,SaleRate,Curr.Qty,Alias,GroupName,Category,Brand,Product,Unit1,ProdConv1,Unit2\n";
async function previewPos(lines: string) {
  return request(app).post("/api/admin/imports/preview").set(auth())
    .field("type", "products").attach("file", Buffer.from(posHeader + lines), "inventory.csv");
}
test("POS export maps exact prices and stock and saves all source columns", async () => {
  const p = await previewPos("Test chocolate,0089000001,10,9.8,7,,Test Supplier,Chocolate,Test Brand,Chocolate original,Pack,1,PCS\n");
  assert.equal(p.status, 201);
  assert.equal(p.body.preview.canCommit, true);
  assert.match(p.body.preview.note, /POS inventory detected/);
  assert.equal(row("SELECT id FROM products WHERE sku='0089000001'"), undefined);
  const commit = await request(app).post(`/api/admin/imports/${p.body.preview.id}/commit`).set(auth()).send({});
  assert.equal(commit.status, 200);
  const product = row("SELECT * FROM products WHERE sku='0089000001'")!;
  assert.equal(product.price, 980);
  assert.equal(product.mrp, 1000);
  assert.equal(product.stock, 7);
  assert.equal(product.unit, "Pack");
  const source = JSON.parse(row("SELECT record_json FROM product_import_sources WHERE product_id=?", product.id)!.record_json);
  assert.equal(source.Barcode, "0089000001");
  assert.equal(source.Brand, "Test Brand");
  assert.equal(source.GroupName, "Test Supplier");
  assert.equal(source.ProdConv1, "1");
  assert.equal(source.Unit2, "PCS");
  const replay = await previewPos("Test chocolate,0089000001,10,9.8,7,,Test Supplier,Chocolate,Test Brand,Chocolate original,Pack,1,PCS\n");
  assert.equal(replay.status, 409);
});
test("zero POS barcodes get distinct stable SKUs when file rows and quantities change", async () => {
  const lines = [
    "Test box alpha,0,20,15,0,,Supplier,Containers,,Box alpha,Pack,1,PCS\n",
    "Test box beta,0,20,16,3,,Supplier,Containers,,Box beta,Pack,1,PCS\n",
  ];
  const p = await previewPos(lines.join(""));
  assert.equal(p.body.preview.canCommit, true);
  const skus = p.body.preview.rows.map((x: Record<string, any>) => x.sku);
  assert.equal(new Set(skus).size, 2);
  assert.ok(skus.every((sku: string) => sku.startsWith("POS-")));
  assert.equal((await request(app).post(`/api/admin/imports/${p.body.preview.id}/commit`).set(auth()).send({})).status, 200);
  const before = row("SELECT id FROM products WHERE sku=?", skus[0])!.id;
  const changed = await previewPos(lines[1] + lines[0].replace(",15,0,", ",14,4,"));
  assert.equal(changed.body.preview.canCommit, true);
  assert.deepEqual(changed.body.preview.rows.map((x: Record<string, any>) => x.sku), [...skus].reverse());
  assert.equal((await request(app).post(`/api/admin/imports/${changed.body.preview.id}/commit`).set(auth()).send({})).status, 200);
  assert.equal(row("SELECT id FROM products WHERE sku=?", skus[0])!.id, before);
  assert.equal(row("SELECT stock FROM products WHERE sku=?", skus[0])!.stock, 4);
});
test("POS stock snapshots preserve current reservations and manually recorded costs and images", async () => {
  const product = row("SELECT * FROM products WHERE sku='0089000001'")!;
  run("UPDATE products SET reserved=2 WHERE id=?", product.id);
  const p = await previewPos("Test chocolate,0089000001,10,9.5,6,,New Supplier,Chocolate,New Brand,Chocolate original,Pack,1,PCS\n");
  assert.equal(p.body.preview.canCommit, true);
  // Admin edits made after preview must also survive a stock-only POS commit.
  run("UPDATE products SET cost=650,image_url='https://example.com/chocolate.png',artwork='snack',low_stock_threshold=3 WHERE id=?", product.id);
  assert.equal((await request(app).post(`/api/admin/imports/${p.body.preview.id}/commit`).set(auth()).send({})).status, 200);
  const updated = row("SELECT * FROM products WHERE id=?", product.id)!;
  assert.equal(updated.stock, 6);
  assert.equal(updated.reserved, 2);
  assert.equal(updated.cost, 650);
  assert.equal(updated.image_url, "https://example.com/chocolate.png");
  assert.equal(updated.artwork, "snack");
  assert.equal(updated.low_stock_threshold, 3);
  const bad = await previewPos("Test chocolate,0089000001,10,9.5,1,,Supplier,Chocolate,,Chocolate original,Pack,1,PCS\n");
  assert.equal(bad.body.preview.canCommit, false);
  assert.equal((await request(app).post(`/api/admin/imports/${bad.body.preview.id}/commit`).set(auth()).send({})).status, 422);
  assert.equal(row("SELECT stock FROM products WHERE id=?", product.id)!.stock, 6);
  run("UPDATE products SET reserved=0 WHERE id=?", product.id);
});
test("POS negative or fractional stock and repeated real barcodes block the whole import", async () => {
  const p = await previewPos([
    "Fractional item,POS-BAD1,20,10,1.5,,Supplier,Containers,,Fractional,Pack,1,PCS\n",
    "Negative item,POS-BAD2,20,10,-1,,Supplier,Containers,,Negative,Pack,1,PCS\n",
    "Duplicate first,POS-BAD3,20,10,2,,Supplier,Containers,,First,Pack,1,PCS\n",
    "Duplicate second,POS-BAD3,20,10,2,,Supplier,Containers,,Second,Pack,1,PCS\n",
  ].join(""));
  assert.equal(p.body.preview.canCommit, false);
  assert.ok(p.body.preview.errorCount >= 3);
  assert.equal((await request(app).post(`/api/admin/imports/${p.body.preview.id}/commit`).set(auth()).send({})).status, 422);
  assert.equal(row("SELECT count(*) count FROM products WHERE sku LIKE 'POS-BAD%' ")!.count, 0);
});
test("invoice import groups lines, keeps historical stock unchanged and blocks duplicate numbers", async () => {
  const csv =
    "invoice_number,invoice_date,customer_phone,sku,quantity,unit_price,discount\nHIST-1,2026-01-02,,RICE,2,500,10\nHIST-1,2026-01-02,,SOAP,1,40,0\n";
  const p = await request(app)
    .post("/api/admin/imports/preview")
    .set(auth())
    .field("type", "invoices")
    .attach("file", Buffer.from(csv), "invoices.csv");
  assert.equal(p.status, 201);
  assert.equal(p.body.preview.canCommit, true);
  assert.equal(p.body.preview.invoiceCount, 1);
  assert.equal(
    (
      await request(app)
        .post(`/api/admin/imports/${p.body.preview.id}/commit`)
        .set(auth())
        .send({})
    ).status,
    200,
  );
  assert.equal(
    row("SELECT stock FROM products WHERE id=?", productId)!.stock,
    18,
  );
  assert.equal(
    row("SELECT total FROM invoices WHERE number=?", "HIST-1")!.total,
    103000,
  );
  const sales = await request(app)
    .get("/api/admin/reports/sales?from=2026-01-02&to=2026-01-02")
    .set(auth());
  assert.equal(sales.body.stats.revenue, 103000);
  assert.equal(sales.body.daily[0].day, "2026-01-02");
  const duplicate = await request(app)
    .post("/api/admin/imports/preview")
    .set(auth())
    .field("type", "invoices")
    .attach("file", Buffer.from(csv + "\n"), "other.csv");
  assert.equal(duplicate.body.preview.canCommit, false);
});
test("failed invoice stock adjustment rolls back invoice and all line deductions", async () => {
  const csv =
    "invoice_number,invoice_date,sku,quantity,unit_price\nROLLBACK,2026-01-03,SOAP,1,40\nROLLBACK,2026-01-03,RICE,999,500\n";
  const p = await request(app)
    .post("/api/admin/imports/preview")
    .set(auth())
    .field("type", "invoices")
    .attach("file", Buffer.from(csv), "rollback.csv");
  assert.equal(p.body.preview.canCommit, true);
  const commit = await request(app)
    .post(`/api/admin/imports/${p.body.preview.id}/commit`)
    .set(auth())
    .send({ adjustInventory: true });
  assert.equal(commit.status, 409);
  assert.equal(
    row("SELECT id FROM invoices WHERE number=?", "ROLLBACK"),
    undefined,
  );
  assert.equal(
    row("SELECT stock FROM products WHERE sku=?", "SOAP")!.stock,
    20,
  );
});
test("soft deletion retains history and revokes access and refresh credentials", async () => {
  assert.equal(
    (await request(app).delete(`/api/admin/users/${customerId}`).set(auth()))
      .status,
    200,
  );
  assert.equal(
    (await request(app).get("/api/auth/me").set(auth(customerToken))).status,
    401,
  );
  assert.equal(
    (await request(app).post("/api/auth/refresh").send({ refreshToken }))
      .status,
    401,
  );
  assert.equal(
    row("SELECT count(*) count FROM invoices WHERE user_id=?", customerId)!
      .count,
    1,
  );
  assert.equal(
    (
      await request(app)
        .post(`/api/admin/users/${customerId}/restore`)
        .set(auth())
    ).status,
    200,
  );
  assert.equal(
    (await request(app).get("/api/auth/me").set(auth(customerToken))).status,
    401,
  );
});
test("refresh tokens rotate and old refresh tokens cannot be replayed", async () => {
  const login = await request(app)
    .post("/api/auth/login")
    .send({ phone: "9876543211", password: pass, role: "customer" });
  const r = await request(app)
    .post("/api/auth/refresh")
    .send({ refreshToken: login.body.refreshToken });
  assert.equal(r.status, 200);
  assert.notEqual(r.body.refreshToken, login.body.refreshToken);
  assert.equal(
    (
      await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: login.body.refreshToken })
    ).status,
    401,
  );
});
test("AI sees aggregate context and provider failures return a safe error", async () => {
  const original = globalThis.fetch;
  let captured = "";
  globalThis.fetch = async (_url, init) => {
    captured = String(init?.body);
    return new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: "There is 1 picked-up order." }] } },
        ],
      }),
      { status: 200 },
    );
  };
  try {
    const r = await request(app)
      .post("/api/admin/ai/chat")
      .set(auth())
      .send({ message: "Sales summary?" });
    assert.equal(r.status, 200);
    assert.match(r.body.answer, /picked-up/);
    assert.ok(captured.includes("liveContext"));
    assert.ok(!captured.includes(pass));
    assert.ok(!captured.includes("password_hash"));
    assert.ok(!captured.includes("test-key"));
    globalThis.fetch = async () => new Response("{}", { status: 403 });
    const rejected = await request(app)
      .post("/api/admin/ai/chat")
      .set(auth())
      .send({ message: "Inventory?" });
    assert.equal(rejected.status, 502);
    assert.equal(rejected.body.code, "AI_CONFIGURATION");
  } finally {
    globalThis.fetch = original;
  }
});
test("new-order notification outbox includes the custom Android tone and persists after dispatch", async () => {
  const notifications = rows(
    "SELECT * FROM notification_outbox WHERE user_id=?",
    adminId,
  );
  assert.ok(notifications.length >= 2);
  assert.equal(notifications[0].sound, "aone_order.wav");
  const data = JSON.parse(notifications[0].data_json);
  assert.ok(data.eventId);
  assert.ok(data.orderId);
});

test("price changes require a fresh checkout total and do not reserve stock", async () => {
  const input = { items: [{ productId, quantity: 1 }], expectedTotal: 1 };
  const reserved = row(
    "SELECT reserved FROM products WHERE id=?",
    productId,
  )!.reserved;
  const failed = await request(app)
    .post("/api/orders")
    .set(auth(otherToken))
    .set("Idempotency-Key", randomUUID())
    .send(input);
  assert.equal(failed.status, 409);
  assert.equal(failed.body.code, "PRICE_CHANGED");
  assert.equal(
    row("SELECT reserved FROM products WHERE id=?", productId)!.reserved,
    reserved,
  );
  const quote = await request(app)
    .post("/api/orders/quote")
    .set(auth(otherToken))
    .send({ items: input.items });
  const key = randomUUID();
  const placed = await request(app)
    .post("/api/orders")
    .set(auth(otherToken))
    .set("Idempotency-Key", key)
    .send({ ...input, expectedTotal: quote.body.quote.total });
  assert.equal(placed.status, 201);
  // Retrying a completed request is safe even if the displayed quote changed.
  const retry = await request(app)
    .post("/api/orders")
    .set(auth(otherToken))
    .set("Idempotency-Key", key)
    .send(input);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.order.id, placed.body.order.id);
  await request(app)
    .patch(`/api/orders/${placed.body.order.id}/status`)
    .set(auth(otherToken))
    .send({ status: "cancelled" });
});

test("customer order filters apply before pagination and exclude other users", async () => {
  const active = await request(app)
    .get("/api/orders?status=active&limit=1")
    .set(auth(otherToken));
  assert.equal(active.status, 200);
  assert.equal(active.body.total, 0);
  const past = await request(app)
    .get("/api/orders?status=past&limit=1")
    .set(auth(otherToken));
  assert.equal(past.status, 200);
  assert.ok(past.body.total >= 1);
  assert.equal(past.body.orders.length, 1);
  assert.equal(past.body.orders[0].userId, otherId);
  assert.ok(
    ["picked", "rejected", "cancelled"].includes(past.body.orders[0].status),
  );
  assert.equal(
    (await request(app).get("/api/orders?status=unknown").set(auth(otherToken)))
      .status,
    422,
  );
});

test("logout invalidates that access session immediately while other sessions remain valid", async () => {
  const session = await request(app)
    .post("/api/auth/login")
    .send({ phone: "9876543211", password: pass, role: "customer" });
  assert.equal(session.status, 200);
  const r = await request(app)
    .post("/api/auth/logout")
    .set(auth(session.body.accessToken))
    .send({ refreshToken: session.body.refreshToken });
  assert.equal(r.status, 200);
  assert.equal(
    (await request(app).get("/api/auth/me").set(auth(session.body.accessToken)))
      .status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: session.body.refreshToken })
    ).status,
    401,
  );
  assert.equal(
    (await request(app).get("/api/auth/me").set(auth(otherToken))).status,
    200,
  );
});

test("sales CSV export and store settings are available only to administrators", async () => {
  const exported = await request(app)
    .get("/api/admin/reports/export/sales?from=2026-01-02&to=2026-01-02")
    .set(auth());
  assert.equal(exported.status, 200);
  assert.match(exported.body.filename, /\.csv$/);
  assert.match(exported.body.csv, /HIST-1/);
  assert.equal(
    (
      await request(app)
        .get("/api/admin/reports/export/sales")
        .set(auth(otherToken))
    ).status,
    403,
  );
  const settings = await request(app).get("/api/admin/settings").set(auth());
  assert.equal(settings.status, 200);
  const updated = await request(app)
    .put("/api/admin/settings")
    .set(auth())
    .send({ ...settings.body.store, acceptingOrders: false });
  assert.equal(updated.status, 200);
  const failed = await request(app)
    .post("/api/orders")
    .set(auth(otherToken))
    .set("Idempotency-Key", randomUUID())
    .send({ items: [{ productId, quantity: 1 }] });
  assert.equal(failed.status, 409);
  await request(app)
    .put("/api/admin/settings")
    .set(auth())
    .send(settings.body.store);
});

test("authenticated realtime delivers the custom tone and stops a revoked session", async () => {
  const { attachRealtime, queueNotification, publishPending } =
    await import("../src/notifications.js");
  const session = await request(app)
    .post("/api/auth/login")
    .send({ phone: "9999999999", password: pass, role: "admin" });
  const server = createServer(app);
  attachRealtime(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const socket = new WebSocket(`ws://127.0.0.1:${port}/realtime`);
  const timeout = () => AbortSignal.timeout(3000);
  try {
    await once(socket, "open", { signal: timeout() });
    const ready = once(socket, "message", { signal: timeout() });
    socket.send(
      JSON.stringify({ type: "auth", token: session.body.accessToken }),
    );
    assert.equal(JSON.parse(String((await ready)[0])).type, "ready");
    const received = once(socket, "message", { signal: timeout() });
    const nid = queueNotification(
      adminId,
      "New order",
      "Realtime integration check",
      { orderId: randomUUID() },
      "aone_order.wav",
    );
    publishPending();
    const message = JSON.parse(String((await received)[0]));
    assert.equal(message.id, nid);
    assert.equal(message.sound, "aone_order.wav");
    await request(app)
      .post("/api/auth/logout")
      .set(auth(session.body.accessToken))
      .send({ refreshToken: session.body.refreshToken });
    const closed = once(socket, "close", { signal: timeout() });
    queueNotification(
      adminId,
      "New order",
      "Revoked session cannot receive",
      {},
      "aone_order.wav",
    );
    publishPending();
    assert.equal((await closed)[0], 4401);
  } finally {
    socket.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
