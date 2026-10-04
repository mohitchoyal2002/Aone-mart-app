import { row, rows } from "./db.js";

type Period = { from: string; to: string; fromISO: string; toISO: string };
type SalesStats = {
  revenue: number;
  invoices: number;
  averageOrder: number;
  summaryRevenue: number;
  summaryInvoices: number;
};
const change = (current: number, previous: number) =>
  previous > 0
    ? Math.round(((current - previous) / previous) * 1000) / 10
    : null;

export async function advancedAnalytics(period: Period, stats: SalesStats) {
  const days = Math.round(
    (Date.parse(period.toISO) - Date.parse(period.fromISO)) / 86400000,
  );
  const previousStart = new Date(
    Date.parse(period.fromISO) - days * 86400000,
  ).toISOString();
  const previousEnd = period.fromISO;
  const args = [period.fromISO, period.toISO];
  const [
    previous,
    previousDailyRows,
    sources,
    weekdayRows,
    orderStatuses,
    customers,
    stockHealth,
  ] = await Promise.all([
    row(
      "SELECT count(*) invoices,coalesce(sum(total),0) revenue FROM invoices WHERE invoice_date>=? AND invoice_date<?",
      previousStart,
      previousEnd,
    ),
    rows(
      "SELECT date(datetime(invoice_date,'+5 hours','+30 minutes')) day,count(*) orders,sum(total) revenue FROM invoices WHERE invoice_date>=? AND invoice_date<? GROUP BY day ORDER BY day",
      previousStart,
      previousEnd,
    ),
    rows(
      "SELECT CASE WHEN order_id IS NOT NULL THEN 'app' WHEN source='pos_summary' THEN 'summary' ELSE 'itemized' END source,count(*) invoices,sum(total) revenue FROM invoices WHERE invoice_date>=? AND invoice_date<? GROUP BY 1 ORDER BY revenue DESC",
      ...args,
    ),
    rows(
      "SELECT cast(strftime('%w',datetime(invoice_date,'+5 hours','+30 minutes')) AS INTEGER) weekday,count(*) invoices,sum(total) revenue FROM invoices WHERE invoice_date>=? AND invoice_date<? GROUP BY 1",
      ...args,
    ),
    rows(
      "SELECT status,count(*) count FROM orders WHERE created_at>=? AND created_at<? GROUP BY status",
      ...args,
    ),
    row(
      `SELECT (SELECT count(*) FROM users WHERE role='customer' AND deleted_at IS NULL AND created_at>=? AND created_at<?) newAccounts,
      count(*) purchasingAccounts,coalesce(sum(CASE WHEN purchases>=2 THEN 1 ELSE 0 END),0) repeatAccounts
      FROM (SELECT user_id,count(*) purchases FROM invoices WHERE user_id IS NOT NULL AND invoice_date>=? AND invoice_date<? GROUP BY user_id)`,
      ...args,
      ...args,
    ),
    row(`SELECT coalesce(sum(CASE WHEN stock-reserved>low_stock_threshold THEN 1 ELSE 0 END),0) healthy,
      coalesce(sum(CASE WHEN stock-reserved>0 AND stock-reserved<=low_stock_threshold THEN 1 ELSE 0 END),0) low,
      coalesce(sum(CASE WHEN stock-reserved<=0 THEN 1 ELSE 0 END),0) outOfStock
      FROM products WHERE deleted_at IS NULL`),
  ]);
  const previousAverage = previous!.invoices
    ? Math.round(previous!.revenue / previous!.invoices)
    : 0;
  const previousTo = new Date(Date.parse(period.from + "T12:00:00Z") - 86400000)
    .toISOString()
    .slice(0, 10);
  const previousFrom = new Date(
    Date.parse(period.from + "T12:00:00Z") - days * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const weekdays = [1, 2, 3, 4, 5, 6, 0].map((weekday, index) => ({
    day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
    weekday,
    invoices: Number(
      weekdayRows.find((v) => v.weekday === weekday)?.invoices || 0,
    ),
    revenue: Number(
      weekdayRows.find((v) => v.weekday === weekday)?.revenue || 0,
    ),
  }));
  const previousDaily = Array.from({ length: days }, (_, index) => {
    const day = new Date(
      Date.parse(previousFrom + "T12:00:00Z") + index * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    return (
      previousDailyRows.find((v) => v.day === day) || {
        day,
        revenue: 0,
        orders: 0,
      }
    );
  });
  return {
    updatedAt: new Date().toISOString(),
    comparison: {
      previousRange: { from: previousFrom, to: previousTo },
      previous: {
        revenue: previous!.revenue,
        invoices: previous!.invoices,
        averageOrder: previousAverage,
      },
      daily: previousDaily,
      changes: {
        revenue: change(stats.revenue, previous!.revenue),
        invoices: change(stats.invoices, previous!.invoices),
        averageOrder: change(stats.averageOrder, previousAverage),
      },
    },
    sources,
    weekdays,
    orderStatuses,
    stockHealth,
    customers: {
      ...customers!,
      repeatRate: customers!.purchasingAccounts
        ? Math.round(
            (customers!.repeatAccounts / customers!.purchasingAccounts) * 1000,
          ) / 10
        : 0,
    },
    coverage: {
      itemizedRevenue: stats.revenue - stats.summaryRevenue,
      summaryRevenue: stats.summaryRevenue,
      itemizedInvoices: stats.invoices - stats.summaryInvoices,
    },
  };
}
