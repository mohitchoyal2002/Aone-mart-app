import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { createHash } from "node:crypto";
import { row, rows, run, transaction, now } from "./db.js";
import { requireAuth, adminOnly } from "./auth.js";
import { id, fail, money, audit, phone, AppError } from "./core.js";
import { extractInvoice } from "./ai.js";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 4 },
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
export type ImportError = { row: number; message: string };
function normalize(record: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    const key = k.trim().toLowerCase().replaceAll(" ", "_");
    out[key] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}
export function validateRows(type: string, records: Record<string, unknown>[]) {
  const normalized: Record<string, any>[] = [],
    errors: ImportError[] = [];
  const seen = new Set<string>();
  const required =
    type === "products"
      ? ["sku", "name", "category", "price", "mrp", "stock"]
      : ["invoice_number", "invoice_date", "sku", "quantity", "unit_price"];
  const schema = type === "products" ? productRow : invoiceRow;
  for (const [index, record] of records.entries()) {
    const value = normalize(record);
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
      const product = row(
        "SELECT stock,reserved,deleted_at FROM products WHERE sku=?",
        data.sku,
      );
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
      if (!row("SELECT id FROM products WHERE sku=?", data.sku))
        errors.push({
          row: index + 2,
          message: `Unknown SKU ${data.sku}; import inventory first`,
        });
      if (row("SELECT id FROM invoices WHERE number=?", data.invoice_number))
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
          const clean = headers.map((v) =>
            v.trim().toLowerCase().replaceAll(" ", "_"),
          );
          if (new Set(clean).size !== clean.length)
            throw new Error("Duplicate CSV headers");
          return clean;
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
    row(
      "SELECT id FROM import_batches WHERE checksum=? AND status=?",
      checksum,
      "committed",
    )
  )
    fail(409, "This exact file was already imported.");
  const { normalized, errors } = validateRows(type, records!),
    bid = id();
  run(
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
  res
    .status(201)
    .json({
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
            : "Stock is the total on-hand quantity; active order reservations are preserved.",
      },
    });
});
importsRouter.post("/:id/commit", (req, res) => {
  const { adjustInventory } = z
      .object({ adjustInventory: z.boolean().default(false) })
      .strict()
      .parse(req.body || {}),
    bid = String(req.params.id);
  const result = transaction(() => {
    const batch = row(
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
      row(
        "SELECT id FROM import_batches WHERE checksum=? AND status=? AND id<>?",
        batch!.checksum,
        "committed",
        bid,
      )
    )
      fail(409, "This file was already imported.");
    const values = JSON.parse(batch!.payload_json) as Record<string, any>[];
    const fresh = validateRows(batch!.type, values);
    if (fresh.errors.length)
      throw new AppError(
        409,
        "Data changed after the preview. Upload again to validate the current inventory.",
        "IMPORT_CONFLICT",
        fresh.errors.slice(0, 20),
      );
    if (batch!.type === "products") {
      for (const p of values) {
        let category = row(
          "SELECT id FROM categories WHERE name=? COLLATE NOCASE",
          p.category,
        );
        if (!category) {
          const cid = id();
          run("INSERT INTO categories(id,name) VALUES(?,?)", cid, p.category);
          category = { id: cid };
        }
        const old = row("SELECT * FROM products WHERE sku=?", p.sku),
          pid = old?.id || id();
        if (old)
          run(
            "UPDATE products SET name=?,category_id=?,price=?,mrp=?,cost=?,stock=?,low_stock_threshold=?,unit=?,image_url=?,artwork=?,updated_at=? WHERE id=?",
            p.name,
            category.id,
            money(p.price),
            money(p.mrp),
            money(p.cost),
            p.stock,
            p.low_stock_threshold,
            p.unit,
            p.image_url,
            p.artwork,
            now(),
            pid,
          );
        else
          run(
            "INSERT INTO products(id,sku,name,category_id,price,mrp,cost,stock,low_stock_threshold,unit,image_url,artwork,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            pid,
            p.sku,
            p.name,
            category.id,
            money(p.price),
            money(p.mrp),
            money(p.cost),
            p.stock,
            p.low_stock_threshold,
            p.unit,
            p.image_url,
            p.artwork,
            now(),
            now(),
          );
        run(
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
      const numbers = [...new Set(values.map((v) => v.invoice_number))];
      for (const number of numbers) {
        const lines = values.filter((v) => v.invoice_number === number),
          first = lines[0],
          invoiceId = id();
        const subtotal = lines.reduce(
            (s, l) => s + money(l.unit_price) * l.quantity,
            0,
          ),
          discount = lines.reduce((s, l) => s + money(l.discount), 0);
        const customer = first.customer_phone
          ? row(
              "SELECT id FROM users WHERE phone=? AND role=?",
              first.customer_phone,
              "customer",
            )
          : undefined;
        run(
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
          const p = row(
            "SELECT p.*,c.name category FROM products p JOIN categories c ON c.id=p.category_id WHERE p.sku=?",
            line.sku,
          )!;
          if (adjustInventory) {
            const result = run(
              "UPDATE products SET stock=stock-?,updated_at=? WHERE id=? AND stock-reserved>=?",
              line.quantity,
              now(),
              p.id,
              line.quantity,
            );
            if (Number(result.changes) !== 1)
              fail(
                409,
                `Not enough unreserved stock for ${p.name}. Import without stock adjustment for historical invoices.`,
              );
            run(
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
          run(
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
    run(
      "UPDATE import_batches SET status=?,committed_at=? WHERE id=?",
      "committed",
      now(),
      bid,
    );
    audit(req.user.id, `${batch!.type}.import`, bid, {
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
importsRouter.get("/", (_req, res) =>
  res.json({
    imports: rows(
      "SELECT id,type,filename,status,created_at createdAt,committed_at committedAt FROM import_batches ORDER BY created_at DESC LIMIT 50",
    ),
  }),
);
