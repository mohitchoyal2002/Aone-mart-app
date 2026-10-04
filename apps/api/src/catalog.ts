import { Router } from "express";
import { z } from "zod";
import { rows, row, run, now, transaction, storeSettings } from "./db.js";
import { requireAuth, adminOnly } from "./auth.js";
import { id, fail, money, page, audit, escapeLike } from "./core.js";
import { listBanners } from "./banners.js";
export const productSchema = z
  .object({
    sku: z.string().trim().min(1).max(60),
    name: z.string().trim().min(2).max(160),
    categoryId: z.string().uuid(),
    price: z.number().min(0).max(1000000),
    mrp: z.number().min(0).max(1000000),
    cost: z.number().min(0).max(1000000).default(0),
    stock: z.number().int().min(0).max(10000000),
    lowStockThreshold: z.number().int().min(0).max(10000000).default(5),
    unit: z.string().trim().min(1).max(60).default("1 unit"),
    imageUrl: z
      .union([
        z.literal(""),
        z
          .url()
          .refine((v) => v.startsWith("https://"), "Image URL must use HTTPS"),
      ])
      .default(""),
    artwork: z
      .enum([
        "rice",
        "milk",
        "oil",
        "fruit",
        "vegetable",
        "soap",
        "bread",
        "bag",
        "snack",
        "tea",
      ])
      .default("bag"),
  })
  .strict()
  .refine((d) => d.mrp >= d.price, "MRP must be at least the selling price");
export const productSelect = `SELECT p.*,c.name category FROM products p JOIN categories c ON c.id=p.category_id`;
export const serializeProduct = (p: Record<string, any>) => ({
  id: p.id,
  sku: p.sku,
  name: p.name,
  categoryId: p.category_id,
  category: p.category,
  price: p.price,
  mrp: p.mrp,
  cost: p.cost,
  stock: p.stock,
  reserved: p.reserved,
  available: p.stock - p.reserved,
  lowStockThreshold: p.low_stock_threshold,
  unit: p.unit,
  imageUrl: p.image_url,
  artwork: p.artwork,
});
export const customerProduct = (p: Record<string, any>) => {
  const { cost, stock, reserved, ...publicData } = serializeProduct(p);
  return publicData;
};
export const catalogRouter = Router();
catalogRouter.get("/store", async (_req, res) =>
  res.json({
    store: {
      ...(await storeSettings()),
      banners: await listBanners(),
      demoCatalog:
        (await row("SELECT value FROM settings WHERE key=?", "demoCatalog"))
          ?.value === "true",
    },
  }),
);
catalogRouter.use(requireAuth);
catalogRouter.get("/categories", async (_req, res) =>
  res.json({
    categories: await rows("SELECT * FROM categories ORDER BY sort_order,name"),
  }),
);
catalogRouter.get("/products", async (req, res) => {
  const { limit, offset } = page(req.query),
    q = escapeLike(String(req.query.q || "").slice(0, 160)),
    cat = String(req.query.categoryId || "");
  const filter = ` WHERE p.deleted_at IS NULL AND (p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\') ${cat ? "AND p.category_id=?" : ""}`;
  const args = cat ? [`%${q}%`, `%${q}%`, cat] : [`%${q}%`, `%${q}%`];
  const items = await rows(
    productSelect + filter + " ORDER BY p.name LIMIT ? OFFSET ?",
    ...args,
    limit,
    offset,
  );
  res.json({
    products: items.map(customerProduct),
    total: (await row(
      "SELECT count(*) count FROM products p" + filter,
      ...args,
    ))!.count,
    limit,
    offset,
  });
});
export const inventoryRouter = Router();
inventoryRouter.use(requireAuth, adminOnly);
inventoryRouter.get("/", async (req, res) => {
  const { limit, offset } = page(req.query),
    q = escapeLike(String(req.query.q || "").slice(0, 160));
  const low =
    req.query.low === "true"
      ? "AND (p.stock-p.reserved)<=p.low_stock_threshold"
      : "";
  const filter = ` WHERE p.deleted_at IS NULL AND (p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\') ${low}`;
  res.json({
    products: (
      await rows(
        productSelect + filter + " ORDER BY p.name LIMIT ? OFFSET ?",
        `%${q}%`,
        `%${q}%`,
        limit,
        offset,
      )
    ).map(serializeProduct),
    total: (await row(
      "SELECT count(*) count FROM products p" + filter,
      `%${q}%`,
      `%${q}%`,
    ))!.count,
    limit,
    offset,
  });
});
inventoryRouter.post("/", async (req, res) => {
  const p = productSchema.parse(req.body),
    pid = id();
  await transaction(async () => {
    if (!(await row("SELECT id FROM categories WHERE id=?", p.categoryId)))
      fail(400, "Choose an existing category.");
    if (await row("SELECT id FROM products WHERE sku=?", p.sku))
      fail(409, "This SKU already exists, including disabled products.");
    await run(
      "INSERT INTO products(id,sku,name,category_id,price,mrp,cost,stock,low_stock_threshold,unit,image_url,artwork,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      pid,
      p.sku,
      p.name,
      p.categoryId,
      money(p.price),
      money(p.mrp),
      money(p.cost),
      p.stock,
      p.lowStockThreshold,
      p.unit,
      p.imageUrl,
      p.artwork,
      now(),
      now(),
    );
    await run(
      "INSERT INTO inventory_movements VALUES(?,?,?,?,?,?,?)",
      id(),
      pid,
      p.stock,
      "opening_stock",
      null,
      req.user.id,
      now(),
    );
    await audit(req.user.id, "product.create", pid);
  });
  res.status(201).json({
    product: serializeProduct(
      (await row(productSelect + " WHERE p.id=?", pid))!,
    ),
  });
});
inventoryRouter.put("/:id", async (req, res) => {
  const p = productSchema.parse(req.body),
    pid = String(req.params.id);
  await transaction(async () => {
    const old = await row(
      "SELECT * FROM products WHERE id=? AND deleted_at IS NULL",
      pid,
    );
    if (!old) fail(404, "Product not found.");
    if (p.stock < old!.reserved)
      fail(
        409,
        `${old!.reserved} units are reserved for active orders. Stock cannot go below this.`,
        "RESERVED_STOCK",
      );
    if (!(await row("SELECT id FROM categories WHERE id=?", p.categoryId)))
      fail(400, "Category not found.");
    if (await row("SELECT id FROM products WHERE sku=? AND id<>?", p.sku, pid))
      fail(409, "This SKU already exists.");
    await run(
      "UPDATE products SET sku=?,name=?,category_id=?,price=?,mrp=?,cost=?,stock=?,low_stock_threshold=?,unit=?,image_url=?,artwork=?,updated_at=? WHERE id=?",
      p.sku,
      p.name,
      p.categoryId,
      money(p.price),
      money(p.mrp),
      money(p.cost),
      p.stock,
      p.lowStockThreshold,
      p.unit,
      p.imageUrl,
      p.artwork,
      now(),
      pid,
    );
    if (old!.stock !== p.stock)
      await run(
        "INSERT INTO inventory_movements VALUES(?,?,?,?,?,?,?)",
        id(),
        pid,
        p.stock - old!.stock,
        "manual_adjustment",
        null,
        req.user.id,
        now(),
      );
    await audit(req.user.id, "product.update", pid);
  });
  res.json({
    product: serializeProduct(
      (await row(productSelect + " WHERE p.id=?", pid))!,
    ),
  });
});
inventoryRouter.delete("/:id", async (req, res) => {
  const pid = String(req.params.id);
  await transaction(async () => {
    const p = await row(
      "SELECT * FROM products WHERE id=? AND deleted_at IS NULL",
      pid,
    );
    if (!p) fail(404, "Product not found.");
    if (p!.reserved > 0)
      fail(
        409,
        "Complete or reject reserved orders before removing this product.",
      );
    await run(
      "UPDATE products SET deleted_at=?,updated_at=? WHERE id=?",
      now(),
      now(),
      pid,
    );
    await audit(req.user.id, "product.soft_delete", pid);
  });
  res.json({ ok: true });
});
inventoryRouter.post("/categories", async (req, res) => {
  const d = z
    .object({
      name: z.string().trim().min(2).max(60),
      icon: z.string().max(40).default("basket"),
    })
    .parse(req.body);
  if (
    await row("SELECT id FROM categories WHERE name=? COLLATE NOCASE", d.name)
  )
    fail(409, "Category already exists.");
  const cid = id();
  await run(
    "INSERT INTO categories(id,name,icon,sort_order) VALUES(?,?,?,?)",
    cid,
    d.name,
    d.icon,
    (await rows("SELECT id FROM categories")).length,
  );
  res
    .status(201)
    .json({ category: await row("SELECT * FROM categories WHERE id=?", cid) });
});
