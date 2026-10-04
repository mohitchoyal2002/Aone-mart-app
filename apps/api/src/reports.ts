import { Router } from "express";
import { advancedAnalytics } from "./analytics.js";
import { z } from "zod";
import { row, rows } from "./db.js";
import { requireAuth, adminOnly } from "./auth.js";
import { fail, page } from "./core.js";
import { productSelect, serializeProduct } from "./catalog.js";
export const indianDate = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
function day(s: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    fail(400, "Use a valid YYYY-MM-DD date.");
  return s;
}
export function dateRange(from?: string, to?: string) {
  const end = day(to || indianDate()),
    start = day(from || indianDate(new Date(Date.now() - 29 * 86400000)));
  const fromISO = new Date(start + "T00:00:00+05:30").toISOString(),
    endMS = Date.parse(end + "T00:00:00+05:30") + 86400000;
  if (
    Date.parse(fromISO) >= endMS ||
    endMS - Date.parse(fromISO) > 366 * 86400000
  )
    fail(400, "Choose an ordered date range of at most 366 days.");
  return {
    from: start,
    to: end,
    fromISO,
    toISO: new Date(endMS).toISOString(),
  };
}
export async function salesReport(from?: string, to?: string) {
  const r = dateRange(from, to),
    args = [r.fromISO, r.toISO];
  const stats = (await row<{
    invoices: number;
    revenue: number;
    discounts: number;
    cost: number;
    summaryRevenue: number;
    summaryInvoices: number;
  }>(
    `SELECT count(*) invoices,coalesce(sum(total),0) revenue,coalesce(sum(discount),0) discounts,coalesce(sum(CASE WHEN source='pos_summary' THEN 1 ELSE 0 END),0) summaryInvoices,coalesce(sum(CASE WHEN source='pos_summary' THEN total ELSE 0 END),0) summaryRevenue,coalesce(sum((SELECT coalesce(sum(ii.unit_cost*ii.quantity),0) FROM invoice_items ii WHERE ii.invoice_id=i.id)),0) cost FROM invoices i WHERE invoice_date>=? AND invoice_date<?`,
    ...args,
  ))!;
  const dailyRows = await rows(
    `SELECT date(datetime(i.invoice_date,'+5 hours','+30 minutes')) day,count(*) orders,sum(i.total) revenue FROM invoices i WHERE i.invoice_date>=? AND i.invoice_date<? GROUP BY day ORDER BY day`,
    ...args,
  );
  const daily = [];
  for (
    let t = Date.parse(r.from + "T00:00:00Z");
    t <= Date.parse(r.to + "T00:00:00Z");
    t += 86400000
  ) {
    const d = new Date(t).toISOString().slice(0, 10);
    daily.push(
      dailyRows.find((v) => v.day === d) || { day: d, revenue: 0, orders: 0 },
    );
  }
  const topProducts = await rows(
    `SELECT ii.sku,ii.name,sum(ii.quantity) units,sum(ii.line_total) grossRevenue FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.invoice_date>=? AND i.invoice_date<? GROUP BY ii.product_id ORDER BY units DESC LIMIT 10`,
    ...args,
  );
  const categories = await rows(
    `SELECT ii.category name,sum(ii.line_total) grossRevenue,sum(ii.quantity) units FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.invoice_date>=? AND i.invoice_date<? GROUP BY ii.category ORDER BY grossRevenue DESC`,
    ...args,
  );
  const topProductsByRevenue = await rows(
    `SELECT ii.sku,ii.name,sum(ii.quantity) units,sum(ii.line_total) grossRevenue FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.invoice_date>=? AND i.invoice_date<? GROUP BY ii.product_id ORDER BY grossRevenue DESC,units DESC LIMIT 10`,
    ...args,
  );
  return {
    range: { from: r.from, to: r.to },
    stats: {
      ...stats,
      profit: stats.revenue - stats.summaryRevenue - stats.cost,
      averageOrder: stats.invoices
        ? Math.round(stats.revenue / stats.invoices)
        : 0,
      units: topProducts.length
        ? (await row(
            "SELECT coalesce(sum(ii.quantity),0) units FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.invoice_date>=? AND i.invoice_date<?",
            ...args,
          ))!.units
        : 0,
    },
    daily,
    topProducts,
    topProductsByRevenue,
    categories,
  };
}
export async function inventoryReport() {
  const stats = (await row(
    `SELECT count(*) products,coalesce(sum(stock),0) units,coalesce(sum(reserved),0) reservedUnits,coalesce(sum(stock*cost),0) costValue,coalesce(sum(stock*price),0) retailValue,coalesce(sum(CASE WHEN stock-reserved<=low_stock_threshold THEN 1 ELSE 0 END),0) lowStock FROM products WHERE deleted_at IS NULL`,
  ))!;
  const categories = await rows(
    "SELECT c.name,sum(p.stock-p.reserved) available,sum(p.reserved) reserved,count(*) products FROM products p JOIN categories c ON c.id=p.category_id WHERE p.deleted_at IS NULL GROUP BY c.id ORDER BY available DESC",
  );
  const lowStock = (
    await rows(
      productSelect +
        " WHERE p.deleted_at IS NULL AND p.stock-p.reserved<=p.low_stock_threshold ORDER BY p.stock-p.reserved LIMIT 50",
    )
  ).map(serializeProduct);
  return { stats, categories, lowStock };
}
export async function dashboard(from?: string, to?: string) {
  const sales = await salesReport(from, to);
  return {
    sales,
    analytics: await advancedAnalytics(dateRange(from, to), sales.stats),
    inventory: await inventoryReport(),
    customers: await row(
      "SELECT count(*) total,coalesce(sum(points),0) rewardPoints FROM users WHERE role=? AND deleted_at IS NULL",
      "customer",
    ),
    orders: await rows(
      "SELECT status,count(*) count FROM orders GROUP BY status",
    ),
  };
}
export const reportsRouter = Router();
reportsRouter.use(requireAuth, adminOnly);
reportsRouter.get("/dashboard", async (req, res) =>
  res.json(
    await dashboard(
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined,
    ),
  ),
);
reportsRouter.get("/sales", async (req, res) =>
  res.json(
    await salesReport(
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined,
    ),
  ),
);
reportsRouter.get("/inventory", async (_req, res) =>
  res.json(await inventoryReport()),
);
reportsRouter.get("/invoices", async (req, res) => {
  const r = dateRange(
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined,
    ),
    { limit, offset } = page(req.query);
  const list = await rows(
    "SELECT i.id,i.number,i.invoice_date date,i.total,i.discount,i.source,coalesce(u.name,s.customer_name) customer FROM invoices i LEFT JOIN users u ON u.id=i.user_id LEFT JOIN invoice_import_sources s ON s.invoice_id=i.id WHERE i.invoice_date>=? AND i.invoice_date<? ORDER BY i.invoice_date DESC LIMIT ? OFFSET ?",
    r.fromISO,
    r.toISO,
    limit,
    offset,
  );
  res.json({
    invoices: list,
    total: (await row(
      "SELECT count(*) count FROM invoices WHERE invoice_date>=? AND invoice_date<?",
      r.fromISO,
      r.toISO,
    ))!.count,
    limit,
    offset,
  });
});
reportsRouter.get("/invoices/:id", async (req, res) => {
  const invoice = await row(
    "SELECT * FROM invoices WHERE id=?",
    String(req.params.id),
  );
  if (!invoice) fail(404, "Invoice not found.");
  res.json({
    invoice,
    summary: await row(
      "SELECT customer_name customer,received,credit,cheque,card,record_json sourceRecord FROM invoice_import_sources WHERE invoice_id=?",
      String(req.params.id),
    ),
    items: await rows(
      "SELECT * FROM invoice_items WHERE invoice_id=?",
      String(req.params.id),
    ),
  });
});
export function csvEscape(v: unknown) {
  const s = String(v ?? "");
  const safe = /^[=+@\-\t\r]/.test(s) ? `'${s}` : s;
  return '"' + safe.replaceAll('"', '""') + '"';
}
async function salesCsv(from?: string, to?: string) {
  const r = dateRange(from, to);
  const lines = await rows(
    "SELECT number,invoice_date,subtotal,discount,total,source FROM invoices WHERE invoice_date>=? AND invoice_date<? ORDER BY invoice_date",
    r.fromISO,
    r.toISO,
  );
  return [
    "invoice_number,invoice_date,subtotal_rupees,discount_rupees,total_rupees,source",
    ...lines.map((v) =>
      [
        v.number,
        v.invoice_date,
        v.subtotal / 100,
        v.discount / 100,
        v.total / 100,
        v.source,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ].join("\r\n");
}
reportsRouter.get("/export/sales", async (req, res) =>
  res.json({
    filename: "aone-sales.csv",
    csv: await salesCsv(
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined,
    ),
  }),
);
reportsRouter.get("/export/sales.csv", async (req, res) => {
  const r = dateRange(
    req.query.from ? String(req.query.from) : undefined,
    req.query.to ? String(req.query.to) : undefined,
  );
  const csv = await salesCsv(r.from, r.to);
  res
    .type("text/csv")
    .setHeader("Content-Disposition", 'attachment; filename="aone-sales.csv"');
  res.send(csv);
});
