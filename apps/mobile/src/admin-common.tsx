import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import { Reveal } from "./motion";
import { LinearGradient } from "expo-linear-gradient";
import { C, T, Input, Chip, Sheet, Button, Card } from "./ui";
export function rangeDays(days = 30) {
  const to = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const from = new Date(Date.parse(to + "T12:00:00Z") - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}
export function RangeBar({
  range,
  onChange,
}: {
  range: { from: string; to: string };
  onChange: (r: { from: string; to: string }) => void;
}) {
  const [custom, setCustom] = useState(false),
    [from, setFrom] = useState(range.from),
    [to, setTo] = useState(range.to);
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {[7, 30, 90].map((d) => (
          <Chip
            key={d}
            label={`${d} days`}
            selected={
              range.from === rangeDays(d).from && range.to === rangeDays(d).to
            }
            onPress={() => onChange(rangeDays(d))}
          />
        ))}
        <Chip
          label="Custom range"
          selected={
            ![7, 30, 90].some(
              (d) =>
                range.from === rangeDays(d).from &&
                range.to === rangeDays(d).to,
            )
          }
          onPress={() => {
            setFrom(range.from);
            setTo(range.to);
            setCustom(true);
          }}
        />
      </ScrollView>
      <Sheet
        visible={custom}
        onClose={() => setCustom(false)}
        title="Sales period"
      >
        <Input
          label="From (YYYY-MM-DD)"
          value={from}
          onChangeText={setFrom}
          placeholder="2026-10-01"
        />
        <Input
          label="To (YYYY-MM-DD)"
          value={to}
          onChangeText={setTo}
          placeholder="2026-10-31"
        />
        <Button
          title="Apply date range"
          onPress={() => {
            onChange({ from, to });
            setCustom(false);
          }}
        />
        <T size={11} color={C.muted} style={{ marginTop: 15 }}>
          Reports use India time. Choose up to 366 days.
        </T>
      </Sheet>
    </>
  );
}
export function StatGrid({
  items,
}: {
  items: {
    title: string;
    value: string;
    note: string;
    icon: React.ReactNode;
  }[];
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {items.map((i, index) => (
        <Reveal
          key={i.title}
          delay={index * 50}
          style={{ flexGrow: 1, flexBasis: "46%", minWidth: 135 }}
        >
          <Card style={{ flex: 1, padding: 18, overflow: "hidden" }}>
            <LinearGradient
              pointerEvents="none"
              colors={
                index % 4 === 0
                  ? ["#FFFFFF", "#E0F5ED"]
                  : index % 4 === 1
                    ? ["#FFFFFF", "#E8F0FA"]
                    : index % 4 === 2
                      ? ["#FFFFFF", "#FFF0E7"]
                      : ["#FFFFFF", "#F0EBFA"]
              }
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 7,
              }}
            >
              <T size={11} color={C.muted} style={{ flex: 1 }}>
                {i.title}
              </T>
              {i.icon}
            </View>
            <T bold size={26} style={{ marginTop: 13 }}>
              {i.value}
            </T>
            <T size={10} color={C.muted} style={{ marginTop: 6 }}>
              {i.note}
            </T>
          </Card>
        </Reveal>
      ))}
    </View>
  );
}
export function NativeTable({
  headers,
  widths,
  children,
}: {
  headers: string[];
  widths: number[];
  children: React.ReactNode;
}) {
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ minWidth: widths.reduce((s, w) => s + w, 0) }}>
          <View
            style={{
              flexDirection: "row",
              backgroundColor: C.subtle,
              paddingVertical: 15,
              borderBottomWidth: 1,
              borderColor: C.line,
            }}
          >
            {headers.map((h, i) => (
              <View key={h} style={{ width: widths[i], paddingHorizontal: 16 }}>
                <T
                  size={10}
                  bold
                  color={C.muted}
                  style={{ letterSpacing: 0.7, textTransform: "uppercase" }}
                >
                  {h}
                </T>
              </View>
            ))}
          </View>
          {children}
        </View>
      </ScrollView>
    </Card>
  );
}
export function Cell({
  width,
  children,
}: {
  width: number;
  children: React.ReactNode;
}) {
  return (
    <View style={{ width, paddingHorizontal: 16, justifyContent: "center" }}>
      {children}
    </View>
  );
}
export function TableRow({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderColor: C.line,
        minHeight: 80,
      }}
    >
      {children}
    </View>
  );
}
export function Pagination({
  offset,
  total,
  onChange,
}: {
  offset: number;
  total: number;
  onChange: (n: number) => void;
}) {
  if (total <= 30) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Button
        title="Previous"
        variant="secondary"
        disabled={!offset}
        onPress={() => onChange(Math.max(0, offset - 30))}
      />
      <T size={10} color={C.muted}>
        {offset + 1}–{Math.min(offset + 30, total)} of {total}
      </T>
      <Button
        title="Next"
        variant="secondary"
        disabled={offset + 30 >= total}
        onPress={() => onChange(offset + 30)}
      />
    </View>
  );
}
