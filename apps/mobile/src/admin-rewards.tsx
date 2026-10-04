import React, { useState, useEffect } from "react";
import { View, Switch } from "react-native";
import { Plus, Ticket } from "lucide-react-native";
import { api } from "./api";
import { useAuth, useLoad, alertError } from "./state";
import {
  C,
  T,
  Button,
  Input,
  Select,
  SectionTitle,
  Loading,
  ErrorView,
  Empty,
  Sheet,
  Page,
  Card,
  money,
  dateLabel,
  Notice,
} from "./ui";
import { rangeDays } from "./admin-common";
import type { Coupon, User } from "./types";
export function RewardsScreen() {
  const { epoch, bump } = useAuth();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [code, setCode] = useState(""),
    [title, setTitle] = useState(""),
    [kind, setKind] = useState("percent"),
    [value, setValue] = useState("10"),
    [minimum, setMinimum] = useState("0"),
    [cap, setCap] = useState(""),
    [maxUses, setMaxUses] = useState("100"),
    [perUser, setPerUser] = useState("1"),
    [target, setTarget] = useState(""),
    [customerSearch, setCustomerSearch] = useState(""),
    [start, setStart] = useState(() => rangeDays(1).to),
    [end, setEnd] = useState(() =>
      new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    );
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const result = useLoad<{ coupons: Coupon[] }>(
    () => api.get("/api/admin/coupons"),
    [epoch],
  );
  const customers = useLoad<{ users: User[] }>(
    () =>
      open
        ? api.get(
            `/api/admin/users?limit=100&q=${encodeURIComponent(customerSearch)}`,
          )
        : Promise.resolve({ users: [] }),
    [open, customerSearch],
  );
  const create = async () => {
    setBusy(true);
    try {
      await api.post("/api/admin/coupons", {
        code,
        title,
        kind,
        value: Number(value),
        minOrder: Number(minimum),
        maxDiscount: cap ? Number(cap) : null,
        startsAt: new Date(start + "T00:00:00+05:30").toISOString(),
        expiresAt: new Date(end + "T23:59:59+05:30").toISOString(),
        maxUses: Number(maxUses),
        perUserLimit: Number(perUser),
        targetUserId: target || null,
        active: true,
      });
      setOpen(false);
      setCode("");
      setTitle("");
      bump();
    } catch (e) {
      alertError(e);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (c: Coupon) => {
    try {
      await api.patch(`/api/admin/coupons/${c.id}`, { active: !c.active });
      bump();
    } catch (e) {
      alertError(e);
    }
  };
  return (
    <Page refresh={result.refresh} refreshing={result.loading && !!result.data}>
      <SectionTitle
        title="Rewards & coupons"
        caption="Give your regulars another reason to shop local."
      />
      <Button
        title="Create coupon"
        onPress={() => setOpen(true)}
        style={{ alignSelf: "flex-start" }}
        icon={<Plus size={16} color={C.white} />}
      />
      <Notice text="Coupons reserve their usage when an order is placed. Rejected or cancelled orders release it. Reward points are earned after pickup." />
      {result.error ? (
        <ErrorView error={result.error} retry={result.refresh} />
      ) : result.loading && !result.data ? (
        <Loading />
      ) : result.data?.coupons.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          {result.data.coupons.map((c) => (
            <Card
              key={c.id}
              style={{ flexBasis: "46%", flexGrow: 1, minWidth: 270 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View
                  style={{
                    padding: 11,
                    backgroundColor: "#F0EDD7",
                    borderRadius: 13,
                  }}
                >
                  <Ticket size={23} color={C.amber} />
                </View>
                <Switch
                  value={c.active}
                  onValueChange={() => void toggle(c)}
                  trackColor={{ true: C.forest, false: C.line }}
                  thumbColor={C.white}
                />
              </View>
              <T bold size={28} style={{ marginTop: 19 }}>
                {c.kind === "percent"
                  ? c.value + "% off"
                  : money(c.value) + " off"}
              </T>
              <T size={12} color={C.muted} style={{ marginTop: 6 }}>
                {c.title}
              </T>
              <T
                bold
                color={C.forest}
                style={{ letterSpacing: 1.8, marginTop: 18 }}
              >
                {c.code}
              </T>
              <View
                style={{
                  height: 1,
                  backgroundColor: C.line,
                  marginVertical: 15,
                }}
              />
              <T size={11} color={C.muted}>
                Min. {money(c.minOrder)} · {c.uses}/{c.maxUses} uses
              </T>
              <T size={11} color={C.muted} style={{ marginTop: 6 }}>
                Until {dateLabel(c.expiresAt)} · {c.perUserLimit} per customer
              </T>
              <T
                size={10}
                color={
                  Date.parse(c.expiresAt) < clock
                    ? C.red
                    : c.active
                      ? C.forest
                      : C.muted
                }
                style={{ marginTop: 9 }}
              >
                {Date.parse(c.expiresAt) < clock
                  ? "Expired"
                  : c.active
                    ? "Active"
                    : "Disabled"}{" "}
                ·{" "}
                {c.targetUserId
                  ? "For one selected customer"
                  : "For all customers"}
              </T>
            </Card>
          ))}
        </View>
      ) : (
        <Empty
          title="A little reward goes a long way"
          detail="Create a coupon for all customers or a special code for one neighbour."
        />
      )}
      <Sheet
        visible={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Create a coupon"
      >
        <Input
          label="Coupon code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="LOCAL10"
        />
        <Input
          label="Offer title"
          value={title}
          onChangeText={setTitle}
          placeholder="A little thank-you from Aone"
        />
        <Select
          label="Discount type"
          value={kind}
          onChange={setKind}
          options={[
            { label: "Percentage off", value: "percent" },
            { label: "Fixed rupees off", value: "fixed" },
          ]}
        />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Input
              label={kind === "percent" ? "Discount (%)" : "Discount (₹)"}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Minimum cart (₹)"
              value={minimum}
              onChangeText={setMinimum}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
        <Input
          label="Maximum discount (₹, optional)"
          value={cap}
          onChangeText={setCap}
          keyboardType="decimal-pad"
        />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Start (YYYY-MM-DD)"
              value={start}
              onChangeText={setStart}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Expiry (YYYY-MM-DD)"
              value={end}
              onChangeText={setEnd}
            />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Total usage limit"
              value={maxUses}
              onChangeText={setMaxUses}
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Uses per customer"
              value={perUser}
              onChangeText={setPerUser}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <Input
          label="Search customer to target (optional)"
          value={customerSearch}
          onChangeText={setCustomerSearch}
          placeholder="Name or phone"
        />
        <Select
          label="Available to"
          value={target}
          onChange={setTarget}
          options={[
            { label: "All customers", value: "" },
            ...(customers.data?.users
              .filter((u) => u.role === "customer")
              .map((u) => ({ label: `${u.name} · ${u.phone}`, value: u.id })) ||
              []),
          ]}
        />
        <Button title="Create coupon" onPress={create} loading={busy} />
      </Sheet>
    </Page>
  );
}
