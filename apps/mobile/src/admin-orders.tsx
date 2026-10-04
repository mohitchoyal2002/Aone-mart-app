import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import { Check, Package } from "lucide-react-native";
import { api } from "./api";
import { useAuth, useLoad, usePoll, alertError } from "./state";
import {
  C,
  T,
  Button,
  Input,
  SectionTitle,
  Chip,
  Status,
  Loading,
  ErrorView,
  Empty,
  Sheet,
  Page,
  money,
  dateLabel,
} from "./ui";
import { NativeTable, Cell, TableRow, Pagination } from "./admin-common";
import { OrderDetails } from "./customer";
import type { Order } from "./types";
export function ActiveOrdersScreen() {
  const { epoch, bump } = useAuth();
  const [status, setStatus] = useState("active"),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(""),
    [selected, setSelected] = useState<Order | null>(null),
    [reject, setReject] = useState<Order | null>(null),
    [reason, setReason] = useState("");
  const result = useLoad<{ orders: Order[]; total: number }>(
    () =>
      api.get(`/api/admin/orders?status=${status}&limit=30&offset=${offset}`),
    [status, offset, epoch],
  );
  usePoll(result.refresh, 15);
  const update = async (o: Order, s: "accepted" | "packed" | "rejected") => {
    setBusy(o.id);
    try {
      await api.patch(`/api/admin/orders/${o.id}/status`, {
        status: s,
        reason: s === "rejected" ? reason : "",
      });
      setReject(null);
      setReason("");
      bump();
    } catch (e) {
      alertError(e);
    } finally {
      setBusy("");
    }
  };
  return (
    <Page refresh={result.refresh} refreshing={result.loading && !!result.data}>
      <SectionTitle
        title="Active orders"
        caption="A quick accept. A carefully packed basket. A happy neighbour."
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {[
          ["active", "Active"],
          ["placed", "New orders"],
          ["accepted", "Preparing"],
          ["packed", "Ready for pickup"],
          ["picked", "Picked up"],
          ["all", "All orders"],
        ].map(([value, label]) => (
          <Chip
            key={value}
            label={label}
            selected={status === value}
            onPress={() => {
              setStatus(value);
              setOffset(0);
            }}
          />
        ))}
      </ScrollView>
      {result.error ? (
        <ErrorView error={result.error} retry={result.refresh} />
      ) : result.loading && !result.data ? (
        <Loading />
      ) : result.data?.orders.length ? (
        <NativeTable
          headers={["Order", "Customer", "Total", "Status", "Actions"]}
          widths={[255, 200, 115, 135, 245]}
        >
          {result.data.orders.map((o) => (
            <TableRow key={o.id}>
              <Cell width={255}>
                <T bold size={12} numberOfLines={1}>
                  {o.number}
                </T>
                <T size={10} color={C.muted} style={{ marginTop: 5 }}>
                  {dateLabel(o.createdAt)} ·{" "}
                  {o.items.reduce((s, p) => s + p.quantity, 0)} items
                </T>
                <Button
                  title="View items"
                  variant="ghost"
                  onPress={() => setSelected(o)}
                  style={{
                    alignSelf: "flex-start",
                    minHeight: 30,
                    paddingHorizontal: 0,
                  }}
                />
              </Cell>
              <Cell width={200}>
                <T bold size={12}>
                  {o.customer?.name}
                </T>
                <T size={11} color={C.muted} style={{ marginTop: 5 }}>
                  {o.customer?.phone}
                </T>
                {o.status === "packed" && (
                  <T bold size={11} color={C.forest} style={{ marginTop: 6 }}>
                    Pickup code: {o.pickupCode}
                  </T>
                )}
              </Cell>
              <Cell width={115}>
                <T bold size={16}>
                  {money(o.total)}
                </T>
                <T size={9} color={C.muted} style={{ marginTop: 5 }}>
                  Pay at pickup
                </T>
              </Cell>
              <Cell width={135}>
                <Status value={o.status} />
              </Cell>
              <Cell width={245}>
                <View
                  style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                >
                  {o.status === "placed" && (
                    <Button
                      title="Accept"
                      onPress={() => void update(o, "accepted")}
                      loading={busy === o.id}
                      icon={<Check size={15} color={C.white} />}
                    />
                  )}{" "}
                  {o.status === "accepted" && (
                    <Button
                      title="Mark packed"
                      onPress={() => void update(o, "packed")}
                      loading={busy === o.id}
                      icon={<Package size={15} color={C.white} />}
                    />
                  )}{" "}
                  {["placed", "accepted"].includes(o.status) && (
                    <Button
                      title="Reject"
                      variant="danger"
                      onPress={() => {
                        setReject(o);
                        setReason("");
                      }}
                      disabled={busy === o.id}
                    />
                  )}{" "}
                  {o.status === "packed" && (
                    <T size={12} color={C.forest}>
                      Customer can confirm collection after pickup.
                    </T>
                  )}
                </View>
              </Cell>
            </TableRow>
          ))}
        </NativeTable>
      ) : (
        <Empty
          title="All clear for now"
          detail="Incoming orders will appear here with a custom notification tone."
        />
      )}
      <Pagination
        offset={offset}
        total={result.data?.total || 0}
        onChange={setOffset}
      />
      <OrderDetails
        admin
        order={
          selected
            ? result.data?.orders.find((o) => o.id === selected.id) || selected
            : null
        }
        onClose={() => setSelected(null)}
      />
      <Sheet
        visible={!!reject}
        onClose={() => setReject(null)}
        title="Reject order"
      >
        <T size={12} color={C.muted} style={{ marginBottom: 18 }}>
          Let the customer know why. Their reserved stock, coupon and points
          will be released.
        </T>
        <Input
          label="Reason for rejection"
          value={reason}
          onChangeText={setReason}
          multiline
          placeholder="e.g. Item is unavailable today"
          maxLength={300}
          style={{ minHeight: 85, textAlignVertical: "top", paddingTop: 12 }}
        />
        <Button
          title="Reject & notify customer"
          variant="danger"
          loading={!!busy}
          disabled={!reason.trim()}
          onPress={() => {
            if (reject) void update(reject, "rejected");
          }}
        />
      </Sheet>
    </Page>
  );
}
