import React, { useState } from "react";
import { View } from "react-native";
import Svg, {
  Path,
  Line,
  Circle,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
  Rect,
  G,
} from "react-native-svg";
import { C, T, money, dateLabel } from "./ui";
const palette = [
  "#1E5C43",
  "#80A660",
  "#BACD86",
  "#E3CA89",
  "#709C9A",
  "#91AFC6",
];
export function RevenueChart({
  data,
}: {
  data: { day: string; revenue: number }[];
}) {
  const [selected, setSelected] = useState(-1),
    [width, setWidth] = useState(300);
  const w = Math.max(250, width),
    h = 205,
    padX = 15,
    padY = 18,
    base = 172,
    max = Math.max(...data.map((d) => d.revenue), 100);
  const coords = data.map((d, i) => ({
    x: padX + (i * (w - padX * 2)) / Math.max(1, data.length - 1),
    y: base - (d.revenue / max) * (base - padY),
  }));
  const path = coords
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" "),
    area = coords.length
      ? `${path} L${coords.at(-1)!.x},${base} L${padX},${base} Z`
      : "";
  const point = selected >= 0 ? data[selected] : null;
  if (!data.length) return <T color={C.muted}>No sales for this period.</T>;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ minHeight: 27, marginBottom: 9 }}>
        <T size={11} color={C.muted}>
          {point
            ? `${dateLabel(point.day + "T12:00:00Z")} · ${money(point.revenue)}`
            : "Tap a point to inspect daily revenue"}
        </T>
      </View>
      <Svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        accessibilityLabel="Daily net sales revenue graph"
      >
        <Defs>
          <LinearGradient id="revenueShade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#83AC64" stopOpacity="0.32" />
            <Stop offset="1" stopColor="#83AC64" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {[0, 0.5, 1].map((v) => (
          <Line
            key={v}
            x1={padX}
            y1={base - v * (base - padY)}
            x2={w - padX}
            y2={base - v * (base - padY)}
            stroke={C.line}
            strokeDasharray="4 4"
          />
        ))}
        <Path d={area} fill="url(#revenueShade)" />
        <Path
          d={path}
          stroke={C.forest}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
        {coords.map((p, i) => (
          <G key={i} onPress={() => setSelected(i)}>
            <Circle
              cx={p.x}
              cy={p.y}
              r={data.length <= 7 ? 4 : i === selected ? 5 : 2}
              fill={C.forest}
            />
            <Rect
              x={p.x - 8}
              y={0}
              width={16}
              height={base + 5}
              fill="transparent"
            />
          </G>
        ))}
        {[0, Math.floor((data.length - 1) / 2), data.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((i) => (
            <SvgText
              key={i}
              x={coords[i].x}
              y={198}
              fontSize={10}
              fill={C.muted}
              textAnchor={
                i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"
              }
            >
              {dateLabel(data[i].day + "T12:00:00Z")}
            </SvgText>
          ))}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <T size={10} color={C.muted}>
          ₹0
        </T>
        <T size={10} color={C.muted}>
          Peak {money(Math.max(...data.map((d) => d.revenue), 0))}
        </T>
      </View>
    </View>
  );
}
export function CategoryBars({
  data,
  currency = false,
}: {
  data: { name: string; value: number }[];
  currency?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View style={{ gap: 17 }}>
      {data.length ? (
        data.map((d, i) => (
          <View key={d.name} style={{ gap: 8 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <T size={12} style={{ flex: 1 }} numberOfLines={1}>
                {d.name}
              </T>
              <T size={12} bold>
                {currency ? money(d.value) : d.value + " units"}
              </T>
            </View>
            <View
              style={{
                height: 10,
                backgroundColor: "#F0F3EC",
                borderRadius: 6,
              }}
            >
              <View
                style={{
                  height: 10,
                  width: `${(d.value / max) * 100}%`,
                  backgroundColor: palette[i % palette.length],
                  borderRadius: 6,
                  minWidth: d.value ? 3 : 0,
                }}
              />
            </View>
          </View>
        ))
      ) : (
        <T size={12} color={C.muted}>
          No activity yet. Your categories will appear here.
        </T>
      )}
    </View>
  );
}
export function StockDonut({
  available,
  reserved,
}: {
  available: number;
  reserved: number;
}) {
  const total = available + reserved,
    size = 134,
    r = 47,
    circ = 2 * Math.PI * r,
    fraction = total ? reserved / total : 0;
  return (
    <View style={{ flexDirection: "row", gap: 20, alignItems: "center" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx="67"
          cy="67"
          r={r}
          stroke="#E8EEE3"
          strokeWidth="17"
          fill="none"
        />
        <Circle
          cx="67"
          cy="67"
          r={r}
          stroke={C.forest}
          strokeWidth="17"
          fill="none"
        />
        <Circle
          cx="67"
          cy="67"
          r={r}
          stroke="#BACD86"
          strokeWidth="17"
          fill="none"
          strokeDasharray={`${fraction * circ} ${circ}`}
          rotation="-90"
          origin="67,67"
        />
        <SvgText
          x="67"
          y="65"
          textAnchor="middle"
          fontSize="22"
          fontWeight="bold"
          fill={C.ink}
        >
          {total}
        </SvgText>
        <SvgText x="67" y="82" textAnchor="middle" fontSize="9" fill={C.muted}>
          UNITS IN STOCK
        </SvgText>
      </Svg>
      <View style={{ flex: 1, gap: 15 }}>
        {[
          { label: "Available", value: available, color: C.forest },
          { label: "Reserved", value: reserved, color: "#BACD86" },
        ].map((d) => (
          <View
            key={d.label}
            style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
          >
            <View
              style={{
                height: 8,
                width: 8,
                borderRadius: 4,
                backgroundColor: d.color,
              }}
            />
            <View>
              <T size={11} color={C.muted}>
                {d.label}
              </T>
              <T bold size={18}>
                {d.value}
              </T>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
