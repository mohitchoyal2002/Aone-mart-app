import React, { useState } from "react";
import { View } from "react-native";
import { C, T, Card, Button, Chip, Notice, money } from "./ui";
import { CategoryBars } from "./charts";
import {
  TrendChart,
  BreakdownDonut,
  WeekdayChart,
  ANALYTICS_COLORS,
} from "./analytics-charts";
import type { Dashboard } from "./types";

export function AnalyticsDashboard({
  dashboard: d,
  onInventory,
}: {
  dashboard: Dashboard;
  onInventory: () => void;
}) {
  const [ranking, setRanking] = useState<"units" | "revenue">("units");
  const a = d.analytics;
  const products =
    ranking === "units"
      ? d.sales.topProducts
      : d.sales.topProductsByRevenue || d.sales.topProducts;
  const statusNames: Record<string, string> = {
    placed: "Waiting",
    accepted: "Accepted",
    packed: "Ready for pickup",
    picked: "Picked up",
    rejected: "Rejected",
    cancelled: "Cancelled",
  };
  const sourceNames = {
    app: "App pickups",
    summary: "Bill summary imports",
    itemized: "Itemized imports",
  };
  const changeText = (
    change: number | null,
    current: number,
    previous: number,
  ) =>
    change === null
      ? current > 0
        ? "New activity"
        : "No sales"
      : `${change > 0 ? "+" : ""}${change}%`;
  return (
    <>
      {a && (
        <Card style={{ gap: 14 }}>
          <T bold size={18}>
            Period comparison
          </T>
          <T size={12} color={C.muted}>
            Compared with {a.comparison.previousRange.from} to{" "}
            {a.comparison.previousRange.to}, the same number of days.
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {[
              {
                title: "Revenue change",
                current: d.sales.stats.revenue,
                previous: a.comparison.previous.revenue,
                change: a.comparison.changes.revenue,
                money: true,
              },
              {
                title: "Bill count change",
                current: d.sales.stats.invoices,
                previous: a.comparison.previous.invoices,
                change: a.comparison.changes.invoices,
                money: false,
              },
              {
                title: "Average bill change",
                current: d.sales.stats.averageOrder,
                previous: a.comparison.previous.averageOrder,
                change: a.comparison.changes.averageOrder,
                money: true,
              },
            ].map((v) => (
              <View
                key={v.title}
                style={{
                  flex: 1,
                  minWidth: 130,
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: "#F0F5EC",
                  gap: 6,
                }}
              >
                <T size={12} color={C.muted}>
                  {v.title}
                </T>
                <T
                  bold
                  size={23}
                  color={
                    v.change !== null && v.change < 0 ? "#A03B3B" : C.forest
                  }
                >
                  {changeText(v.change, v.current, v.previous)}
                </T>
                <T size={12}>
                  {v.money ? money(v.current) : `${v.current} bills`} now
                </T>
                <T size={11} color={C.muted}>
                  {v.money ? money(v.previous) : `${v.previous} bills`} before
                </T>
              </View>
            ))}
          </View>
        </Card>
      )}
      <Card style={{ gap: 15 }}>
        <T bold size={18}>
          Sales & bill trends
        </T>
        <T size={12} color={C.muted}>
          {d.sales.range.from} to {d.sales.range.to} · India time
        </T>
        <TrendChart data={d.sales.daily} previous={a?.comparison.daily} />
      </Card>
      {!!d.sales.stats.summaryInvoices && (
        <Notice
          text={`${d.sales.stats.summaryInvoices} imported bill summaries count toward revenue. Product/category charts and estimated profit use itemized invoices only.`}
        />
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 15 }}>
        {a && (
          <Card style={{ flex: 1, minWidth: 250, gap: 16 }}>
            <T bold size={18}>
              Sales sources
            </T>
            <BreakdownDonut
              currency
              data={a.sources.map((v) => ({
                name: sourceNames[v.source],
                value: v.revenue,
                note: `${v.invoices} bills`,
              }))}
            />
            <T size={11} color={C.muted}>
              Net revenue after discounts, split by how the invoice was
              recorded.
            </T>
          </Card>
        )}
        {a && (
          <Card style={{ flex: 1, minWidth: 250, gap: 16 }}>
            <T bold size={18}>
              Weekday sales pattern
            </T>
            <WeekdayChart data={a.weekdays} />
          </Card>
        )}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 15 }}>
        <Card style={{ flex: 1, minWidth: 250, gap: 16 }}>
          <T bold size={18}>
            Top products
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip
              label="By units"
              selected={ranking === "units"}
              onPress={() => setRanking("units")}
            />
            <Chip
              label="By gross sales"
              selected={ranking === "revenue"}
              onPress={() => setRanking("revenue")}
            />
          </View>
          <CategoryBars
            currency={ranking === "revenue"}
            data={products
              .slice(0, 6)
              .map((v) => ({
                name: v.name,
                value: ranking === "units" ? v.units : v.grossRevenue,
              }))}
          />
          <T size={11} color={C.muted}>
            Six leaders from itemized invoices. Gross sales are before
            invoice-level discounts.
          </T>
        </Card>
        <Card style={{ flex: 1, minWidth: 250, gap: 16 }}>
          <T bold size={18}>
            Category performance
          </T>
          <BreakdownDonut
            currency
            data={d.sales.categories.map((v) => ({
              name: v.name,
              value: v.grossRevenue,
              note: `${v.units} units`,
            }))}
          />
          <T size={11} color={C.muted}>
            Gross itemized sales before invoice-level discounts.
          </T>
        </Card>
      </View>
      {a && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 15 }}>
          <Card style={{ flex: 1, minWidth: 250, gap: 16 }}>
            <T bold size={18}>
              Customers coming back
            </T>
            <T bold size={35} color={C.forest}>
              {a.customers.repeatRate}%
            </T>
            <T size={13} color={C.muted}>
              {a.customers.repeatAccounts} of {a.customers.purchasingAccounts}{" "}
              purchasing accounts bought at least twice in this period.
            </T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
              <View>
                <T bold size={24}>
                  {a.customers.newAccounts}
                </T>
                <T size={12} color={C.muted}>
                  New accounts
                </T>
              </View>
              <View>
                <T bold size={24}>
                  {money(d.sales.stats.averageOrder)}
                </T>
                <T size={12} color={C.muted}>
                  Average bill · all sales
                </T>
              </View>
            </View>
            <T size={11} color={C.muted}>
              Repeat rate uses invoices linked to app customer accounts.
              Anonymous imported customers are excluded.
            </T>
          </Card>
          <Card style={{ flex: 1, minWidth: 250, gap: 16 }}>
            <T bold size={18}>
              Pickup order progress
            </T>
            <BreakdownDonut
              data={a.orderStatuses.map((v) => ({
                name: statusNames[v.status] || v.status,
                value: v.count,
              }))}
            />
            <T size={11} color={C.muted}>
              Current status of app orders placed during the selected dates.
              Imported invoices are excluded.
            </T>
          </Card>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 15 }}>
        <Card style={{ flex: 1, minWidth: 250, gap: 16 }}>
          <T bold size={18}>
            Stock health · right now
          </T>
          {a && (
            <BreakdownDonut
              data={[
                {
                  name: "Healthy products",
                  value: a.stockHealth.healthy,
                  color: C.forest,
                },
                {
                  name: "Low-stock products",
                  value: a.stockHealth.low,
                  color: ANALYTICS_COLORS[2],
                },
                {
                  name: "Out of stock",
                  value: a.stockHealth.outOfStock,
                  color: ANALYTICS_COLORS[4],
                },
              ]}
            />
          )}
          <T size={12} color={C.muted}>
            {d.inventory.stats.units - d.inventory.stats.reservedUnits}{" "}
            available units · {d.inventory.stats.reservedUnits} reserved
          </T>
          <T size={11} color={C.muted}>
            Counts reflect available stock after reservations. This snapshot
            does not use the date filter.
          </T>
          <Button
            title="Manage inventory"
            variant="ghost"
            onPress={onInventory}
          />
        </Card>
        <Card style={{ flex: 1, minWidth: 250, gap: 16 }}>
          <T bold size={18}>
            Itemized profit estimate
          </T>
          <T bold size={30} color={C.forest}>
            {money(d.sales.stats.profit)}
          </T>
          <T size={13} color={C.muted}>
            Net itemized revenue minus recorded item costs. Store expenses are
            excluded.
          </T>
          <View style={{ gap: 8 }}>
            <T size={12}>
              Itemized revenue:{" "}
              {money(
                a?.coverage.itemizedRevenue ??
                  d.sales.stats.revenue - (d.sales.stats.summaryRevenue || 0),
              )}
            </T>
            <T size={12}>Recorded item costs: {money(d.sales.stats.cost)}</T>
            <T size={12}>
              Inventory at recorded cost: {money(d.inventory.stats.costValue)}
            </T>
          </View>
          <T size={11} color={C.muted}>
            Bill summaries lack item costs and are excluded from this estimate.
            Inventory value is a current snapshot.
          </T>
        </Card>
      </View>
      {a && (
        <T size={11} color={C.muted}>
          Updated{" "}
          {new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(a.updatedAt))}{" "}
          IST · Pull down to refresh
        </T>
      )}
    </>
  );
}
