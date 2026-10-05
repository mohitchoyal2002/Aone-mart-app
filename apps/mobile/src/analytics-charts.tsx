import { ActionPressable as Pressable } from "./motion";
import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Path,
  Line,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import { C, T, Chip, money, dateLabel } from "./ui";
import type { SalesReport } from "./types";

export const ANALYTICS_COLORS = [
  C.forest,
  "#476EA8",
  "#9A6216",
  "#72558F",
  "#B64646",
  "#577B38",
];
type Daily = SalesReport["daily"][number];
function grouped(data: Daily[], size: number) {
  const groups: (Daily & { end: string })[] = [];
  for (let i = 0; i < data.length; i += size) {
    const values = data.slice(i, i + size);
    groups.push({
      day: values[0].day,
      end: values.at(-1)!.day,
      revenue: values.reduce((sum, v) => sum + v.revenue, 0),
      orders: values.reduce((sum, v) => sum + v.orders, 0),
    });
  }
  return groups;
}
const shortMoney = (value: number) =>
  value >= 10000000
    ? `₹${(value / 10000000).toFixed(1)}L`
    : value >= 100000
      ? `₹${(value / 100000).toFixed(1)}k`
      : money(Math.round(value));
const dayLabel = (day: string) => dateLabel(day + "T12:00:00Z");

export function TrendChart({
  data,
  previous,
}: {
  data: Daily[];
  previous?: Daily[];
}) {
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");
  const [size, setSize] = useState(1);
  const key = `${metric}-${size}-${data[0]?.day}-${data.at(-1)?.day}-${data.reduce((sum, v) => sum + v.revenue + v.orders, 0)}`;
  return (
    <View style={{ gap: 12 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Chip
          label="Revenue"
          selected={metric === "revenue"}
          onPress={() => setMetric("revenue")}
        />
        <Chip
          label="Bills"
          selected={metric === "orders"}
          onPress={() => setMetric("orders")}
        />
        <Chip label="Daily" selected={size === 1} onPress={() => setSize(1)} />
        <Chip label="Weekly" selected={size === 7} onPress={() => setSize(7)} />
      </ScrollView>
      <TrendPlot
        key={key}
        data={grouped(data, size)}
        previous={previous ? grouped(previous, size) : undefined}
        metric={metric}
      />
      {size === 7 && (
        <T size={11} color={C.muted}>
          Seven-day groups start on the selected From date. The last group may
          be shorter.
        </T>
      )}
    </View>
  );
}
function TrendPlot({
  data,
  previous,
  metric,
}: {
  data: (Daily & { end: string })[];
  previous?: (Daily & { end: string })[];
  metric: "revenue" | "orders";
}) {
  const [selected, setSelected] = useState(Math.max(0, data.length - 1));
  const [width, setWidth] = useState(300);
  const w = Math.max(width, 240),
    left = 48,
    right = w - 12,
    top = 15,
    base = 178,
    h = 212;
  const maximum = Math.max(
    ...data.map((v) => v[metric]),
    ...(previous || []).map((v) => v[metric]),
    metric === "revenue" ? 100 : 1,
  );
  const max = metric === "orders" ? Math.ceil(maximum) : maximum;
  const ticks = (
    metric === "orders" ? [0, Math.ceil(max / 2), max] : [0, max / 2, max]
  ).filter((v, i, values) => values.indexOf(v) === i);
  const format = (v: number) =>
    metric === "revenue" ? money(v) : `${v} bills`;
  const coordinates = (values: Daily[]) =>
    values.map((v, i) => ({
      x:
        data.length === 1
          ? (left + right) / 2
          : left + (i * (right - left)) / Math.max(1, data.length - 1),
      y: base - (v[metric] / max) * (base - top),
    }));
  const coords = coordinates(data),
    oldCoords = coordinates(previous || []);
  const pathFor = (values: { x: number; y: number }[]) =>
    values
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
  const path = pathFor(coords);
  const area = coords.length
    ? `${path} L${coords.at(-1)!.x},${base} L${coords[0].x},${base} Z`
    : "";
  const point = data[selected],
    old = previous?.[selected];
  if (!point) return <T color={C.muted}>No sales in this period.</T>;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ gap: 10 }}
    >
      <View
        style={{
          backgroundColor: "#F0F5EC",
          borderRadius: 14,
          padding: 12,
          gap: 4,
        }}
        accessibilityLiveRegion="polite"
      >
        <T bold size={14}>
          {dayLabel(point.day)}
          {point.end !== point.day ? ` – ${dayLabel(point.end)}` : ""} ·{" "}
          {format(point[metric])}
        </T>
        {old && (
          <T size={12} color={C.muted}>
            Previous: {dayLabel(old.day)}
            {old.end !== old.day ? ` – ${dayLabel(old.end)}` : ""} ·{" "}
            {format(old[metric])}
          </T>
        )}
      </View>
      <Svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        accessibilityLabel={`${metric === "revenue" ? "Revenue" : "Bill count"} trend. Current period in green${previous ? ", previous period in dashed blue" : ""}. Use the point controls below for exact values.`}
        onPress={(e) => {
          const x = (e.nativeEvent.locationX * w) / Math.max(width, 1);
          const i = coords.reduce(
            (best, p, index) =>
              Math.abs(p.x - x) < Math.abs(coords[best].x - x) ? index : best,
            0,
          );
          setSelected(i);
        }}
      >
        <Defs>
          <LinearGradient id="analyticsShade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.forest} stopOpacity="0.24" />
            <Stop offset="1" stopColor={C.forest} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {ticks.map((v) => (
          <React.Fragment key={v}>
            <Line
              x1={left}
              x2={right}
              y1={base - (v / max) * (base - top)}
              y2={base - (v / max) * (base - top)}
              stroke={C.line}
              strokeDasharray="4 4"
            />
            <SvgText
              x={left - 6}
              y={base - (v / max) * (base - top) + 4}
              textAnchor="end"
              fontSize={10}
              fill={C.muted}
            >
              {metric === "revenue" ? shortMoney(v) : v}
            </SvgText>
          </React.Fragment>
        ))}
        <Path d={area} fill="url(#analyticsShade)" />
        {!!oldCoords.length && (
          <Path
            d={pathFor(oldCoords)}
            fill="none"
            stroke={ANALYTICS_COLORS[1]}
            strokeWidth={2}
            strokeDasharray="5 5"
          />
        )}
        <Path
          d={path}
          fill="none"
          stroke={C.forest}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Line
          x1={coords[selected].x}
          x2={coords[selected].x}
          y1={top}
          y2={base}
          stroke={C.forest}
          strokeOpacity="0.35"
          strokeDasharray="3 3"
        />
        <Circle
          cx={coords[selected].x}
          cy={coords[selected].y}
          r={5}
          fill={C.forest}
          stroke="white"
          strokeWidth={2}
        />
        {oldCoords[selected] && (
          <Circle
            cx={oldCoords[selected].x}
            cy={oldCoords[selected].y}
            r={4}
            fill={ANALYTICS_COLORS[1]}
          />
        )}
        {[0, Math.floor((data.length - 1) / 2), data.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((i) => (
            <SvgText
              key={i}
              x={coords[i].x}
              y={201}
              textAnchor={
                i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"
              }
              fontSize={10}
              fill={C.muted}
            >
              {dayLabel(data[i].day)}
            </SvgText>
          ))}
      </Svg>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        <T size={12} color={C.forest}>
          ● Current period
        </T>
        {previous && (
          <T size={12} color={ANALYTICS_COLORS[1]}>
            ┄ Previous period
          </T>
        )}
      </View>
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {[
          {
            title: "Previous point",
            disabled: selected === 0,
            next: selected - 1,
          },
          {
            title: "Next point",
            disabled: selected === data.length - 1,
            next: selected + 1,
          },
        ].map((control) => (
          <Pressable
            key={control.title}
            accessibilityRole="button"
            accessibilityLabel={control.title}
            accessibilityState={{ disabled: control.disabled }}
            disabled={control.disabled}
            onPress={() => setSelected(control.next)}
            style={{
              minHeight: 44,
              paddingHorizontal: 12,
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: "#F0F5EC",
              opacity: control.disabled ? 0.5 : 1,
            }}
          >
            <T bold size={12} color={C.forest}>
              {control.title}
            </T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function BreakdownDonut({
  data,
  currency = false,
  empty = "No activity in this period.",
}: {
  data: { name: string; value: number; note?: string; color?: string }[];
  currency?: boolean;
  empty?: string;
}) {
  const [selected, setSelected] = useState(-1);
  const total = data.reduce((sum, v) => sum + Math.max(0, v.value), 0),
    radius = 47,
    circumference = 2 * Math.PI * radius;
  const selectedItem = data[selected];
  const offsets = data.reduce<number[]>(
    (values, v) => [...values, values.at(-1)! + Math.max(0, v.value)],
    [0],
  );
  const slices = data.map((v, i) => {
    const length = total ? (Math.max(0, v.value) / total) * circumference : 0;
    const segment = {
      ...v,
      length,
      offset: total ? (offsets[i] / total) * circumference : 0,
      color: v.color || ANALYTICS_COLORS[i % ANALYTICS_COLORS.length],
    };
    return segment;
  });
  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          flexDirection: "row",
          gap: 14,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Svg
          width={136}
          height={136}
          viewBox="0 0 136 136"
          accessibilityLabel={`Total ${currency ? money(total) : total}`}
        >
          <Circle
            cx={68}
            cy={68}
            r={radius}
            fill="none"
            stroke="#E8EEE3"
            strokeWidth={17}
          />
          {slices
            .filter((v) => v.length > 0)
            .map((v) => (
              <Circle
                key={v.name}
                cx={68}
                cy={68}
                r={radius}
                fill="none"
                stroke={v.color}
                strokeWidth={17}
                strokeDasharray={`${v.length} ${circumference}`}
                strokeDashoffset={-v.offset}
                rotation={-90}
                origin="68,68"
              />
            ))}
          <SvgText
            x={68}
            y={67}
            textAnchor="middle"
            fontSize={currency ? 16 : 23}
            fontWeight="bold"
            fill={C.ink}
          >
            {currency
              ? shortMoney(selectedItem?.value ?? total)
              : (selectedItem?.value ?? total)}
          </SvgText>
          <SvgText
            x={68}
            y={85}
            textAnchor="middle"
            fontSize={10}
            fill={C.muted}
          >
            {selectedItem
              ? `${total ? ((selectedItem.value / total) * 100).toFixed(1) : 0}% share`
              : "TOTAL"}
          </SvgText>
        </Svg>
        <View style={{ flex: 1, minWidth: 125 }}>
          <T bold size={16}>
            {selectedItem?.name || "Tap a category"}
          </T>
          <T size={12} color={C.muted} style={{ marginTop: 6 }}>
            {selectedItem
              ? `${currency ? money(selectedItem.value) : selectedItem.value}${selectedItem.note ? ` · ${selectedItem.note}` : ""}`
              : total
                ? "See exact values and share below."
                : empty}
          </T>
        </View>
      </View>
      {slices.map((v, i) => (
        <Pressable
          key={v.name}
          accessibilityRole="button"
          accessibilityLabel={`${v.name}, ${currency ? money(v.value) : v.value}, ${total ? ((v.value / total) * 100).toFixed(1) : 0} percent${v.note ? `, ${v.note}` : ""}`}
          accessibilityState={{ selected: selected === i }}
          onPress={() => setSelected(selected === i ? -1 : i)}
          style={{
            minHeight: 48,
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: 8,
            backgroundColor: selected === i ? "#F0F5EC" : "transparent",
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
          }}
        >
          <View
            style={{
              height: 10,
              width: 10,
              borderRadius: 5,
              backgroundColor: v.color,
            }}
          />
          <View style={{ flex: 1 }}>
            <T size={13} bold>
              {v.name}
            </T>
            {v.note && (
              <T size={11} color={C.muted}>
                {v.note}
              </T>
            )}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <T size={13} bold>
              {currency ? money(v.value) : v.value}
            </T>
            <T size={11} color={C.muted}>
              {total ? ((v.value / total) * 100).toFixed(1) : 0}%
            </T>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function WeekdayChart({
  data,
}: {
  data: { day: string; revenue: number; invoices: number }[];
}) {
  const [width, setWidth] = useState(300),
    max = Math.max(...data.map((v) => v.revenue), 100);
  const w = Math.max(240, width),
    left = 12,
    cell = (w - 24) / 7,
    base = 135;
  const best = data.reduce(
    (peak, v) => (v.revenue > peak.revenue ? v : peak),
    data[0],
  );
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ gap: 10 }}
    >
      <T size={12} color={C.muted}>
        {best?.revenue
          ? `${best.day} leads with ${money(best.revenue)} from ${best.invoices} bills.`
          : "Weekday patterns appear when sales are recorded."}
      </T>
      <Svg
        width="100%"
        height={173}
        viewBox={`0 0 ${w} 173`}
        accessibilityLabel={data
          .map((v) => `${v.day}: ${money(v.revenue)}, ${v.invoices} bills`)
          .join(". ")}
      >
        {[0, 0.5, 1].map((v) => (
          <Line
            key={v}
            x1={left}
            x2={w - left}
            y1={base - v * 118}
            y2={base - v * 118}
            stroke={C.line}
            strokeDasharray="4 4"
          />
        ))}
        {data.map((v, i) => (
          <React.Fragment key={v.day}>
            <Rect
              x={left + cell * i + cell * 0.2}
              y={base - (v.revenue / max) * 118}
              width={cell * 0.6}
              height={(v.revenue / max) * 118}
              rx={5}
              fill={v === best ? C.forest : ANALYTICS_COLORS[1]}
            />
            <SvgText
              x={left + cell * (i + 0.5)}
              y={157}
              fontSize={11}
              textAnchor="middle"
              fill={C.muted}
            >
              {v.day}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
      <T size={11} color={C.muted}>
        Total revenue by weekday within this range. Weekdays can occur different
        numbers of times.
      </T>
    </View>
  );
}
