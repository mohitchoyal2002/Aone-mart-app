import React, { useState } from "react";
import { View } from "react-native";
import {
  IndianRupee,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
  Download,
} from "lucide-react-native";
import { api } from "./api";
import { useAuth, useLoad, alertError } from "./state";
import {
  C,
  T,
  Button,
  SectionTitle,
  Loading,
  ErrorView,
  Empty,
  Page,
  Card,
  Sheet,
  money,
  dateLabel,
  Notice,
} from "./ui";
import {
  StatGrid,
  RangeBar,
  rangeDays,
  NativeTable,
  Cell,
  TableRow,
  Pagination,
} from "./admin-common";
import { CategoryBars } from "./charts";
import { TrendChart } from "./analytics-charts";
import { ImportButton, shareCsv } from "./import-ui";
import type { SalesReport } from "./types";
export function SalesScreen() {
  const { epoch, bump } = useAuth();
  const [range, setRange] = useState(rangeDays(30)),
    [offset, setOffset] = useState(0),
    [exporting, setExporting] = useState(false),
    [selected, setSelected] = useState<any>(null);
  const qs = `from=${range.from}&to=${range.to}`;
  const sales = useLoad<SalesReport>(
    () => api.get("/api/admin/reports/sales?" + qs),
    [qs, epoch],
  );
  const invoices = useLoad<{
    invoices: {
      id: string;
      number: string;
      date: string;
      total: number;
      discount: number;
      source: string;
      customer?: string;
    }[];
    total: number;
  }>(
    () =>
      api.get(`/api/admin/reports/invoices?${qs}&limit=30&offset=${offset}`),
    [qs, offset, epoch],
  );
  const exportSales = async () => {
    setExporting(true);
    try {
      const r = await api.get<{ filename: string; csv: string }>(
        "/api/admin/reports/export/sales?" + qs,
      );
      await shareCsv(r.filename, r.csv);
    } catch (e) {
      alertError(e);
    } finally {
      setExporting(false);
    }
  };
  const openInvoice = async (id: string) => {
    try {
      setSelected(await api.get("/api/admin/reports/invoices/" + id));
    } catch (e) {
      alertError(e);
    }
  };
  const stats = sales.data?.stats;
  return (
    <Page
      refresh={() => {
        sales.refresh();
        invoices.refresh();
      }}
      refreshing={sales.loading && !!sales.data}
    >
      <SectionTitle
        title="Sales & invoices"
        caption="Clear numbers. Better store decisions."
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <ImportButton type="invoices" onComplete={bump} />
        <Button
          title="Export report"
          variant="secondary"
          onPress={exportSales}
          loading={exporting}
          icon={<Download size={16} color={C.forest} />}
        />
      </View>
      <RangeBar
        range={range}
        onChange={(r) => {
          setRange(r);
          setOffset(0);
        }}
      />
      {sales.error ? (
        <ErrorView error={sales.error} retry={sales.refresh} />
      ) : sales.loading && !sales.data ? (
        <Loading />
      ) : (
        stats && (
          <>
            <StatGrid
              items={[
                {
                  title: "Net revenue",
                  value: money(stats.revenue),
                  note: "After coupon and reward discounts",
                  icon: <IndianRupee size={16} color={C.forest} />,
                },
                {
                  title: "Sales invoices",
                  value: String(stats.invoices),
                  note: "Picked-up and imported sales",
                  icon: <ReceiptText size={16} color={C.forest} />,
                },
                {
                  title: "Gross profit estimate",
                  value: money(stats.profit),
                  note: stats.summaryInvoices
                    ? `Itemized sales only · ${stats.summaryInvoices} summaries excluded`
                    : "Revenue minus recorded item costs",
                  icon: <TrendingUp size={16} color={C.forest} />,
                },
                {
                  title: "Average sale",
                  value: money(stats.averageOrder),
                  note: `${stats.units} items sold in this period`,
                  icon: <ShoppingBag size={16} color={C.forest} />,
                },
              ]}
            />
            {!!stats.summaryInvoices && (
              <Notice
                text={`${stats.summaryInvoices} bill summaries (${money(stats.summaryRevenue)}) count toward revenue. They have no product lines or costs, so stock, product/category sales and profit exclude them.`}
              />
            )}
            <Card>
              <T bold size={17} style={{ marginBottom: 15 }}>
                Sales over time
              </T>
              <TrendChart data={sales.data!.daily} />
            </Card>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 15 }}>
              <Card style={{ flex: 1, minWidth: 270 }}>
                <T bold style={{ marginBottom: 17 }}>
                  Gross sales by category
                </T>
                <CategoryBars
                  currency
                  data={sales.data!.categories.map((c) => ({
                    name: c.name,
                    value: c.grossRevenue,
                  }))}
                />
              </Card>
              <Card style={{ flex: 1, minWidth: 270 }}>
                <T bold style={{ marginBottom: 17 }}>
                  Top products by units sold
                </T>
                {sales.data!.topProducts.length ? (
                  sales.data!.topProducts.map((p, i) => (
                    <View
                      key={p.sku}
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        alignItems: "center",
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderColor: C.line,
                      }}
                    >
                      <View
                        style={{
                          height: 26,
                          width: 26,
                          backgroundColor: "#EFF3E8",
                          borderRadius: 9,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <T bold size={10} color={C.forest}>
                          {i + 1}
                        </T>
                      </View>
                      <View style={{ flex: 1 }}>
                        <T size={12} bold>
                          {p.name}
                        </T>
                        <T size={10} color={C.muted} style={{ marginTop: 4 }}>
                          {money(p.grossRevenue)} gross
                        </T>
                      </View>
                      <T size={12} bold>
                        {p.units} units
                      </T>
                    </View>
                  ))
                ) : (
                  <T size={12} color={C.muted}>
                    Sold products appear here after pickup or invoice import.
                  </T>
                )}
              </Card>
            </View>
          </>
        )
      )}
      <SectionTitle
        title="Sales invoices"
        caption="Incoming orders count as sales only after pickup."
      />
      {invoices.error ? (
        <ErrorView error={invoices.error} retry={invoices.refresh} />
      ) : invoices.data?.invoices.length ? (
        <NativeTable
          headers={[
            "Invoice",
            "Date",
            "Customer / source",
            "Net sale",
            "Details",
          ]}
          widths={[255, 130, 210, 135, 100]}
        >
          {invoices.data.invoices.map((i) => (
            <TableRow key={i.id}>
              <Cell width={255}>
                <T bold size={12}>
                  {i.number}
                </T>
              </Cell>
              <Cell width={130}>
                <T size={12}>{dateLabel(i.date)}</T>
              </Cell>
              <Cell width={210}>
                <T size={12}>{i.customer || "Walk-in customer"}</T>
                <T size={10} color={C.muted} style={{ marginTop: 5 }}>
                  {i.source === "pickup"
                    ? "App pickup"
                    : i.source === "pos_summary"
                      ? "Bill summary"
                      : "Imported invoice"}
                </T>
              </Cell>
              <Cell width={135}>
                <T size={16} bold>
                  {money(i.total)}
                </T>
              </Cell>
              <Cell width={100}>
                <Button
                  title="View"
                  variant="ghost"
                  onPress={() => void openInvoice(i.id)}
                  style={{ paddingHorizontal: 0 }}
                />
              </Cell>
            </TableRow>
          ))}
        </NativeTable>
      ) : invoices.loading ? (
        <Loading />
      ) : (
        <Empty
          title="No sales in this period"
          detail="Picked-up orders and imported invoices will appear here."
        />
      )}
      <Pagination
        offset={offset}
        total={invoices.data?.total || 0}
        onChange={setOffset}
      />
      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title="Sales invoice"
      >
        {selected && (
          <View style={{ gap: 18 }}>
            <T bold size={18}>
              {selected.invoice.number}
            </T>
            <T size={12} color={C.muted}>
              {dateLabel(selected.invoice.invoice_date)}
            </T>
            <Card>
              {selected.summary && (
                <View style={{ gap: 10 }}>
                  <Notice text="Bill-wise summary. The uploaded file has no product lines. Stock and profit are not inferred." />
                  <T bold>{selected.summary.customer || "Walk-in customer"}</T>
                  <T size={14}>Received: {money(selected.summary.received)}</T>
                  <T size={14}>Credit: {money(selected.summary.credit)}</T>
                  <T size={14}>Cheque: {money(selected.summary.cheque)}</T>
                  <T size={14}>Card: {money(selected.summary.card)}</T>
                </View>
              )}
              {selected.items.map((p: any) => (
                <View
                  key={p.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 10,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderColor: C.line,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <T size={12} bold>
                      {p.name}
                    </T>
                    <T size={10} color={C.muted}>
                      {p.quantity} × {money(p.unit_price)}
                    </T>
                  </View>
                  <T size={12}>{money(p.line_total)}</T>
                </View>
              ))}
              <View style={{ marginTop: 20, gap: 9 }}>
                <T size={12} color={C.muted}>
                  Discounts: {money(selected.invoice.discount)}
                </T>
                <T bold size={22}>
                  Net sale: {money(selected.invoice.total)}
                </T>
              </View>
            </Card>
          </View>
        )}
      </Sheet>
    </Page>
  );
}
