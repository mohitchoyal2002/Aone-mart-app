import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { createHash } from "node:crypto";
import {
  row,
  rows,
  run,
  transaction,
  now,
  batchRun,
  type Statement,
} from "./db.js";
import { requireAuth, adminOnly } from "./auth.js";
import { id, fail, money, audit, phone, AppError } from "./core.js";
import { extractInvoice } from "./ai.js";
import { config } from "./config.js";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (config.serverless ? 4 : 5) * 1024 * 1024,
    files: 1,
    fields: 4,
  },
});
const number = z.coerce.number().finite();
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const productRow = z
  .object({
    sku: text(1, 60),
    name: text(2, 160),
    category: text(2, 60),
    price: number.min(0).max(1000000),
    mrp: number.min(0).max(1000000),
    cost: number.min(0).max(1000000).default(0),
    stock: number.int().min(0).max(10000000),
    low_stock_threshold: number.int().min(0).max(10000000).default(5),
    unit: text(1, 60).default("1 unit"),
    image_url: z
      .union([z.literal(""), z.url().refine((s) => s.startsWith("https://"))])
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
    source_format: z.literal("pos_inventory").optional(),
    source_record: z
      .record(z.string().max(120), z.string().max(10000))
      .optional(),
  })
  .refine((d) => d.mrp >= d.price, "MRP must be at least the selling price");
const invoiceRow = z
  .object({
    invoice_number: text(1, 80),
    invoice_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) =>
          Number.isFinite(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v,
        "Enter a valid invoice date",
      ),
    customer_phone: z.union([phone, z.literal("")]).default(""),
    sku: text(1, 60),
    quantity: number.int().min(1).max(1000000),
    unit_price: number.min(0).max(1000000),
    discount: number.min(0).max(1000000).default(0),
  })
  .refine(
    (d) => money(d.discount) <= money(d.unit_price) * d.quantity,
    "Line discount cannot exceed line amount",
  );
export type ImportError = {
  row: number;
  message: string;
};
function headerKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s.\-]+/g, "_");
}
function normalize(record: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    const key = headerKey(k);
    out[key] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}
function inventoryValue(record: Record<string, unknown>) {
  const value = normalize(record);
  if (
    !(
      "salerate" in value &&
      "curr_qty" in value &&
      ("nametodisplay" in value || "product" in value)
    )
  )
    return value;
  const name = String(value.nametodisplay || value.product || "").trim();
  const barcode = String(value.barcode || "").trim();
  // Zero is a missing POS barcode, never a shared SKU. Identity is independent
  // of row order, stock and price so later stock snapshots update the same item.
  const identity = [
    name,
    value.unit1 || "Pack",
    value.unit2 || "",
    value.prodconv1 || "",
  ]
    .map((v) => String(v).trim().replace(/\s+/g, " ").toUpperCase())
    .join("|");
  return {
    sku:
      barcode && !/^0+$/.test(barcode)
        ? barcode
        : `POS-${createHash("sha256").update(identity).digest("hex").slice(0, 20).toUpperCase()}`,
    name,
    category: value.category,
    price: value.salerate,
    mrp: value.mrp,
    stock: value.curr_qty,
    unit: value.unit1 || "Pack",
    source_format: "pos_inventory",
    source_record: Object.fromEntries(
      Object.entries(record).map(([k, v]) => [k, String(v ?? "")]),
    ),
  };
}
async function productsForImport(skus: string[]) {
  const result = new Map<string, Record<string, any>>();
  const unique = [...new Set(skus)];
  for (let start = 0; start < unique.length; start += 400) {
    const chunk = unique.slice(start, start + 400);
    for (const product of await rows(
      `SELECT p.*,c.name category FROM products p JOIN categories c ON c.id=p.category_id WHERE p.sku IN (${chunk.map(() => "?").join(",")})`,
      ...chunk,
    ))
      result.set(product.sku, product);
  }
  return result;
}
export async function validateRows(
  type: string,
  records: Record<string, unknown>[],
) {
  const normalized: Record<string, any>[] = [],
    errors: ImportError[] = [];
  const prepared = records.map((record) =>
    type === "products" ? inventoryValue(record) : normalize(record),
  );
  const products = await productsForImport(
    prepared.map((value) => String(value.sku || "")),
  );
  const invoiceNumbers = new Set<string>();
  if (type === "invoices") {
    const numbers = [
      ...new Set(prepared.map((value) => String(value.invoice_number || ""))),
    ];
    for (let start = 0; start < numbers.length; start += 400) {
      const chunk = numbers.slice(start, start + 400);
      for (const invoice of await rows(
        `SELECT number FROM invoices WHERE number IN (${chunk.map(() => "?").join(",")})`,
        ...chunk,
      ))
        invoiceNumbers.add(invoice.number);
    }
  }
  const seen = new Set<string>();
  const required =
    type === "products"
      ? ["sku", "name", "category", "price", "mrp", "stock"]
      : ["invoice_number", "invoice_date", "sku", "quantity", "unit_price"];
  const schema = type === "products" ? productRow : invoiceRow;
  for (const [index, record] of records.entries()) {
    const value = prepared[index];
    for (const k of required)
      if (value[k] === undefined || value[k] === "")
        errors.push({ row: index + 2, message: `${k} is required` });
    for (const key of [
      "cost",
      "low_stock_threshold",
      "unit",
      "artwork",
      "discount",
    ])
      if (value[key] === "") delete value[key];
    const result = schema.safeParse(value);
    if (!result.success) {
      errors.push({
        row: index + 2,
        message: result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      continue;
    }
    const data = result.data as Record<string, any>;
    if (type === "products") {
      if (seen.has(data.sku))
        errors.push({
          row: index + 2,
          message: `Duplicate SKU ${data.sku} in this file`,
        });
      seen.add(data.sku);
      const product = products.get(data.sku);
      if (product?.deleted_at)
        errors.push({
          row: index + 2,
          message: `SKU ${data.sku} belongs to a disabled product`,
        });
      if (product && product.reserved > data.stock)
        errors.push({
          row: index + 2,
          message: `${data.sku} has ${product.reserved} reserved units; stock cannot be lower`,
        });
    } else {
      if (!products.has(data.sku))
        errors.push({
          row: index + 2,
          message: `Unknown SKU ${data.sku}; import inventory first`,
        });
      if (invoiceNumbers.has(data.invoice_number))
        errors.push({
          row: index + 2,
          message: `Invoice ${data.invoice_number} already exists`,
        });
      const other = normalized.find(
        (x) => x.invoice_number === data.invoice_number,
      );
      if (
        other &&
        (other.invoice_date !== data.invoice_date ||
          other.customer_phone !== data.customer_phone)
      )
        errors.push({
          row: index + 2,
          message:
            "Rows for one invoice must have the same date and customer phone",
        });
    }
    normalized.push(data);
  }
  return { normalized, errors };
}
export const importsRouter = Router();
importsRouter.use(requireAuth, adminOnly);
importsRouter.post("/preview", upload.single("file"), async (req, res) => {
  const type = z.enum(["products", "invoices"]).parse(req.body.type),
    file = req.file;
  if (!file) fail(400, "Choose a CSV or invoice file.");
  const ext = file!.originalname.toLowerCase().split(".").pop();
  let records: Record<string, unknown>[];
  if (ext === "csv") {
    try {
      records = parse(file!.buffer, {
        bom: true,
        columns: (headers: string[]) => {
          const clean = headers.map(headerKey);
          if (new Set(clean).size !== clean.length)
            throw new Error("Duplicate CSV headers");
          // Keep source column names in the stored POS record. Validation uses
          // normalized headers and rejects collisions before parsing rows.
          return headers;
        },
        skip_empty_lines: true,
        trim: true,
        max_record_size: 100000,
      }) as Record<string, unknown>[];
    } catch {
      throw new AppError(
        422,
        "CSV format is invalid. Use the provided template, with one header row.",
      );
    }
  } else if (
    type === "invoices" &&
    ["pdf", "png", "jpg", "jpeg"].includes(ext || "")
  ) {
    let mime = "";
    const b = file!.buffer;
    if (ext === "pdf" && b.subarray(0, 5).toString() === "%PDF-")
      mime = "application/pdf";
    if (
      ext === "png" &&
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      mime = "image/png";
    if (["jpg", "jpeg"].includes(ext!) && b[0] === 255 && b[1] === 216)
      mime = "image/jpeg";
    if (!mime) fail(422, "File content does not match its extension.");
    records = await extractInvoice(file!.buffer, mime);
  } else
    fail(
      422,
      "Inventory accepts CSV. Sales invoices accept CSV, PDF, PNG or JPG.",
    );
  if (!records!.length || records!.length > 5000)
    fail(422, "Choose a file containing 1 to 5,000 rows.");
  const checksum = createHash("sha256")
    .update(type)
    .update(file!.buffer)
    .digest("hex");
  if (
    await row(
      "SELECT id FROM import_batches WHERE checksum=? AND status=?",
      checksum,
      "committed",
    )
  )
    fail(409, "This exact file was already imported.");
  const { normalized, errors } = await validateRows(type, records!),
    bid = id();
  await run(
    "INSERT INTO import_batches(id,type,filename,checksum,payload_json,errors_json,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)",
    bid,
    type,
    file!.originalname.slice(0, 200),
    checksum,
    JSON.stringify(normalized),
    JSON.stringify(errors),
    req.user.id,
    now(),
  );
  const invoiceCount = new Set(normalized.map((x) => x.invoice_number)).size;
  const pos =
    type === "products" &&
    normalized.some((p) => p.source_format === "pos_inventory");
  const generatedSkus = pos
    ? normalized.filter((p) => /^POS-/.test(p.sku)).length
    : 0;
  res.status(201).json({
    preview: {
      id: bid,
      type,
      filename: file!.originalname,
      rowCount: records!.length,
      validRows: normalized.length,
      invoiceCount: type === "invoices" ? invoiceCount : undefined,
      errors: errors.slice(0, 200),
      errorCount: errors.length,
      rows: normalized.slice(0, 20),
      canCommit: errors.length === 0,
      requiresReview: ext !== "csv",
      note:
        type === "invoices"
          ? "Historical invoices do not change inventory unless you enable stock adjustment. Review extracted amounts before confirming."
          : pos
            ? `POS inventory detected: SaleRate is the selling price in rupees; Curr.Qty is on-hand stock in Unit1. ${generatedSkus} missing/zero barcodes receive stable product IDs. Original columns are saved. Existing costs, images and stock-alert settings are retained; new items have no purchase cost or image in this file. Set purchase costs before relying on profit reports. Active order reservations are preserved.`
            : "Stock is the total on-hand quantity; active order reservations are preserved.",
    },
  });
});
importsRouter.post("/:id/commit", async (req, res) => {
  const { adjustInventory } = z
      .object({ adjustInventory: z.boolean().default(false) })
      .strict()
      .parse(req.body || {}),
    bid = String(req.params.id);
  const result = await transaction(async () => {
    const batch = await row(
      "SELECT * FROM import_batches WHERE id=? AND actor_id=?",
      bid,
      req.user.id,
    );
    if (!batch) fail(404, "Import preview not found.");
    if (batch!.status === "committed")
      return { id: bid, status: "committed", alreadyCommitted: true };
    if (Date.parse(batch!.created_at) < Date.now() - 86400000)
      fail(409, "Preview expired. Upload the file again.");
    if (JSON.parse(batch!.errors_json).length)
      fail(422, "Fix CSV errors and upload again before importing.");
    if (
      await row(
        "SELECT id FROM import_batches WHERE checksum=? AND status=? AND id<>?",
        batch!.checksum,
        "committed",
        bid,
      )
    )
      fail(409, "This file was already imported.");
    const values = JSON.parse(batch!.payload_json) as Record<string, any>[];
    const fresh = await validateRows(batch!.type, values);
    if (fresh.errors.length)
      throw new AppError(
        409,
        "Data changed after the preview. Upload again to validate the current inventory.",
        "IMPORT_CONFLICT",
        fresh.errors.slice(0, 20),
      );
    const statements: Statement[] = [];
    const add = (sql: string, ...args: Statement["args"]) =>
      statements.push({ sql, args });
    const products = await productsForImport(values.map((p) => p.sku));
    if (batch!.type === "products") {
      const categories = new Map(
        (await rows("SELECT id,name FROM categories")).map((c) => [
          c.name.toLowerCase(),
          c.id,
        ]),
      );
      for (const p of values) {
        let categoryId = categories.get(p.category.toLowerCase());
        if (!categoryId) {
          categoryId = id();
          add(
            "INSERT INTO categories(id,name) VALUES(?,?)",
            categoryId,
            p.category,
          );
          categories.set(p.category.toLowerCase(), categoryId);
        }
        const old = products.get(p.sku),
          pid = old?.id || id();
        const pos = p.source_format === "pos_inventory";
        const cost = pos && old ? old.cost : money(p.cost);
        const threshold =
          pos && old ? old.low_stock_threshold : p.low_stock_threshold;
        const image = pos && old ? old.image_url : p.image_url;
        const artwork = pos && old ? old.artwork : p.artwork;
        if (old)
          add(
            "UPDATE products SET name=?,category_id=?,price=?,mrp=?,cost=?,stock=?,low_stock_threshold=?,unit=?,image_url=?,artwork=?,updated_at=? WHERE id=?",
            p.name,
            categoryId,
            money(p.price),
            money(p.mrp),
            cost,
            p.stock,
            threshold,
            p.unit,
            image,
            artwork,
            now(),
            pid,
          );
        else
          add(
            "INSERT INTO products(id,sku,name,category_id,price,mrp,cost,stock,low_stock_threshold,unit,image_url,artwork,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            pid,
            p.sku,
            p.name,
            categoryId,
            money(p.price),
            money(p.mrp),
            cost,
            p.stock,
            threshold,
            p.unit,
            image,
            artwork,
            now(),
            now(),
          );
        if (pos)
          add(
            "INSERT INTO product_import_sources(product_id,import_batch_id,format,record_json,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET import_batch_id=excluded.import_batch_id,format=excluded.format,record_json=excluded.record_json,updated_at=excluded.updated_at",
            pid,
            bid,
            p.source_format,
            JSON.stringify(p.source_record),
            now(),
          );
        add(
          "INSERT INTO inventory_movements VALUES(?,?,?,?,?,?,?)",
          id(),
          pid,
          p.stock - (old?.stock || 0),
          "csv_import",
          bid,
          req.user.id,
          now(),
        );
      }
    } else {
      if (adjustInventory) {
        const deductions = new Map<string, number>();
        for (const line of values)
          deductions.set(
            line.sku,
            (deductions.get(line.sku) || 0) + line.quantity,
          );
        for (const [sku, quantity] of deductions) {
          const product = products.get(sku)!;
          if (product.stock - product.reserved < quantity)
            fail(
              409,
              `Not enough unreserved stock for ${product.name}. Import without stock adjustment for historical invoices.`,
            );
        }
      }
      const grouped = new Map<string, Record<string, any>[]>();
      for (const line of values)
        grouped.set(line.invoice_number, [
          ...(grouped.get(line.invoice_number) || []),
          line,
        ]);
      for (const [number, lines] of grouped) {
        const first = lines[0],
          invoiceId = id();
        const subtotal = lines.reduce(
            (s, l) => s + money(l.unit_price) * l.quantity,
            0,
          ),
          discount = lines.reduce((s, l) => s + money(l.discount), 0);
        const customer = first.customer_phone
          ? await row(
              "SELECT id FROM users WHERE phone=? AND role=?",
              first.customer_phone,
              "customer",
            )
          : undefined;
        add(
          "INSERT INTO invoices VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          invoiceId,
          number,
          null,
          customer?.id || null,
          first.customer_phone || null,
          new Date(first.invoice_date + "T12:00:00+05:30").toISOString(),
          subtotal,
          discount,
          subtotal - discount,
          "import",
          now(),
        );
        for (const line of lines) {
          const p = products.get(line.sku)!;
          if (adjustInventory) {
            add(
              "UPDATE products SET stock=stock-?,updated_at=? WHERE id=?",
              line.quantity,
              now(),
              p.id,
            );
            add(
              "INSERT INTO inventory_movements VALUES(?,?,?,?,?,?,?)",
              id(),
              p.id,
              -line.quantity,
              "invoice_import",
              bid,
              req.user.id,
              now(),
            );
          }
          add(
            "INSERT INTO invoice_items VALUES(?,?,?,?,?,?,?,?,?,?)",
            id(),
            invoiceId,
            p.id,
            p.sku,
            p.name,
            p.category,
            line.quantity,
            money(line.unit_price),
            p.cost,
            money(line.unit_price) * line.quantity,
          );
        }
      }
    }
    // Bounded HTTP payloads, one write transaction across every batch.
    for (let start = 0; start < statements.length; start += 400)
      await batchRun(statements.slice(start, start + 400));
    await run(
      "UPDATE import_batches SET status=?,committed_at=? WHERE id=?",
      "committed",
      now(),
      bid,
    );
    await audit(req.user.id, `${batch!.type}.import`, bid, {
      rows: values.length,
      adjustInventory,
    });
    return {
      id: bid,
      status: "committed",
      importedRows: values.length,
      alreadyCommitted: false,
    };
  });
  res.json(result);
});
importsRouter.get("/", async (_req, res) =>
  res.json({
    imports: await rows(
      "SELECT id,type,filename,status,created_at createdAt,committed_at committedAt FROM import_batches ORDER BY created_at DESC LIMIT 50",
    ),
  }),
);
