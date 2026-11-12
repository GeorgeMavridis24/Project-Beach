/**
 * Απλά γραφήματα με react-native-svg, σύμφωνα με κανόνες καλής οπτικοποίησης:
 * μία σειρά = ένα χρώμα, λεπτές μπάρες (<=24px) με στρογγυλεμένη άκρη,
 * διακριτικές γραμμές πλέγματος, τιμή μόνο στο επιλεγμένο σημείο (πάτημα),
 * και εναλλαγή σε πίνακα για προσβασιμότητα.
 */
import React, { useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

import { C, VIZ } from "@/constants/brand";

export type Datum = { label: string; value: number; hint?: string };

function niceScale(max: number, ticks = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step =
    [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step)
    out.push(Number(v.toFixed(6)));
  return out;
}

export function compact(v: number): string {
  if (Math.abs(v) >= 10000) return `${Math.round(v / 1000)}K`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1).replace(".0", "")}K`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(e.nativeEvent.layout.width)];
}

function topRounded(x: number, y: number, w: number, h: number, r = 4) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/** Στήλες, μία σειρά δεδομένων. Πάτημα σε στήλη -> εμφανίζει την τιμή της. */
export function ColumnChart({
  data,
  format,
  height = 180,
  color = VIZ.series,
}: {
  data: Datum[];
  format: (v: number) => string;
  height?: number;
  color?: string;
}) {
  const [width, onLayout] = useWidth();
  const maxIndex = data.reduce(
    (best, d, i) => (d.value > data[best].value ? i : best),
    0,
  );
  const [selected, setSelected] = useState<number | null>(null);
  const shown = selected ?? maxIndex;
  const ticks = niceScale(Math.max(...data.map((d) => d.value), 0));
  const top = ticks[ticks.length - 1] || 1;
  const left = 36;
  const bottom = 22;
  const plotH = height - bottom - 8;
  const plotW = Math.max(0, width - left);
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => 8 + plotH - (v / top) * plotH;

  return (
    <View onLayout={onLayout}>
      {data.length ? (
        <Text style={ch.caption}>
          <Text style={ch.captionLabel}>
            {data[shown].hint ?? data[shown].label}:{" "}
          </Text>
          {format(data[shown].value)}
          {selected === null ? (
            <Text style={ch.captionMuted}> (μέγιστο)</Text>
          ) : null}
        </Text>
      ) : null}
      {width > 0 ? (
        <View>
          <Svg width={width} height={height} pointerEvents="none">
            {ticks.map((t) => (
              <React.Fragment key={t}>
                <Line
                  x1={left}
                  x2={width}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? VIZ.axis : VIZ.grid}
                  strokeWidth={1}
                />
                <SvgText
                  x={left - 6}
                  y={y(t) + 4}
                  fontSize={10}
                  fill={VIZ.inkMuted}
                  textAnchor="end"
                >
                  {compact(t)}
                </SvgText>
              </React.Fragment>
            ))}
            {data.map((d, i) => {
              const x = left + i * band + (band - barW) / 2;
              const h = Math.max(0, y(0) - y(d.value));
              const on = i === shown;
              return (
                <React.Fragment key={d.label + i}>
                  {h > 0 ? (
                    <Path
                      d={topRounded(x, y(d.value), barW, h)}
                      fill={color}
                      opacity={selected === null || on ? 1 : 0.45}
                    />
                  ) : null}
                  {data.length <= 12 ||
                  i % Math.ceil(data.length / 12) === 0 ? (
                    <SvgText
                      x={left + i * band + band / 2}
                      y={height - 6}
                      fontSize={10}
                      fill={on ? VIZ.ink : VIZ.inkMuted}
                      textAnchor="middle"
                    >
                      {d.label}
                    </SvgText>
                  ) : null}
                </React.Fragment>
              );
            })}
          </Svg>
          <View
            style={[
              StyleSheet.absoluteFill,
              { flexDirection: "row", paddingLeft: left },
            ]}
          >
            {data.map((d, i) => (
              <Pressable
                key={d.label + i}
                style={{ width: band, height }}
                onPress={() => setSelected(i === selected ? null : i)}
                accessibilityRole="button"
                accessibilityLabel={`${d.hint ?? d.label}: ${format(d.value)}`}
              />
            ))}
          </View>
        </View>
      ) : (
        <View style={{ height }} />
      )}
    </View>
  );
}

/** Γραμμή με απαλή περιοχή (π.χ. πληρότητα ανά ημέρα). Σύρε/πάτα για τιμή. */
export function LineChart({
  data,
  format,
  height = 170,
  max,
}: {
  data: Datum[];
  format: (v: number) => string;
  height?: number;
  max?: number;
}) {
  const [width, onLayout] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const ticks = niceScale(max ?? Math.max(...data.map((d) => d.value), 0));
  const top = ticks[ticks.length - 1] || 1;
  const left = 36;
  const bottom = 22;
  const plotH = height - bottom - 8;
  const plotW = Math.max(1, width - left - 6);
  const x = (i: number) =>
    left + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => 8 + plotH - (v / top) * plotH;
  const line = data
    .map(
      (d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`,
    )
    .join(" ");
  const area = data.length
    ? `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
    : "";
  const pick = (e: GestureResponderEvent) => {
    const lx = e.nativeEvent.locationX;
    const i = Math.round(((lx - left) / plotW) * (data.length - 1));
    setActive(Math.max(0, Math.min(data.length - 1, i)));
  };
  const shown = active ?? (data.length ? data.length - 1 : null);
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <View onLayout={onLayout}>
      {shown !== null ? (
        <Text style={ch.caption}>
          <Text style={ch.captionLabel}>
            {data[shown].hint ?? data[shown].label}:{" "}
          </Text>
          {format(data[shown].value)}
        </Text>
      ) : null}
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
      >
        {width > 0 ? (
          <Svg width={width} height={height} pointerEvents="none">
            {ticks.map((t) => (
              <React.Fragment key={t}>
                <Line
                  x1={left}
                  x2={width}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? VIZ.axis : VIZ.grid}
                  strokeWidth={1}
                />
                <SvgText
                  x={left - 6}
                  y={y(t) + 4}
                  fontSize={10}
                  fill={VIZ.inkMuted}
                  textAnchor="end"
                >
                  {format(t)}
                </SvgText>
              </React.Fragment>
            ))}
            <Path d={area} fill={VIZ.series} opacity={0.1} />
            <Path
              d={line}
              stroke={VIZ.series}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {data.map((d, i) =>
              i % labelEvery === 0 ? (
                <SvgText
                  key={i}
                  x={x(i)}
                  y={height - 6}
                  fontSize={10}
                  fill={VIZ.inkMuted}
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
              ) : null,
            )}
            {shown !== null ? (
              <>
                <Line
                  x1={x(shown)}
                  x2={x(shown)}
                  y1={8}
                  y2={y(0)}
                  stroke={VIZ.axis}
                  strokeWidth={1}
                />
                <Circle
                  cx={x(shown)}
                  cy={y(data[shown].value)}
                  r={6}
                  fill={C.card}
                />
                <Circle
                  cx={x(shown)}
                  cy={y(data[shown].value)}
                  r={4}
                  fill={VIZ.series}
                />
              </>
            ) : null}
          </Svg>
        ) : (
          <View style={{ height }} />
        )}
      </View>
    </View>
  );
}

/** Ταξινομημένες οριζόντιες μπάρες (όνομα, μπάρα, τιμή). */
export function BarList({
  data,
  format,
  sub,
}: {
  data: Datum[];
  format: (v: number) => string;
  sub?: (d: Datum) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <View style={{ gap: 12 }}>
      {sorted.map((d) => (
        <View key={d.label}>
          <View style={ch.barHead}>
            <Text style={ch.barName} numberOfLines={1}>
              {d.label}
            </Text>
            <Text style={ch.barValue}>{format(d.value)}</Text>
          </View>
          <View style={ch.track}>
            <View style={[ch.fill, { width: `${(d.value / max) * 100}%` }]} />
          </View>
          {sub ? <Text style={ch.barSub}>{sub(d)}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function KpiTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View
      style={ch.kpi}
      accessible
      accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ""}`}
    >
      <Text style={ch.kpiLabel}>{label}</Text>
      <Text style={ch.kpiValue} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
      {hint ? <Text style={ch.kpiHint}>{hint}</Text> : null}
    </View>
  );
}

/** Κάρτα γραφήματος με εναλλαγή "Γράφημα / Πίνακας". */
export function ChartCard({
  title,
  subtitle,
  table,
  children,
}: {
  title: string;
  subtitle?: string;
  table?: { label: string; value: string }[];
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <View style={ch.card}>
      <View style={ch.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={ch.cardTitle}>{title}</Text>
          {subtitle ? <Text style={ch.cardSub}>{subtitle}</Text> : null}
        </View>
        {table ? (
          <Pressable
            onPress={() => setAsTable(!asTable)}
            accessibilityRole="button"
            style={ch.toggle}
          >
            <Text style={ch.toggleText}>{asTable ? "Γράφημα" : "Πίνακας"}</Text>
          </Pressable>
        ) : null}
      </View>
      {asTable && table ? (
        <View>
          {table.map((r) => (
            <View key={r.label} style={ch.tr}>
              <Text style={ch.td}>{r.label}</Text>
              <Text style={[ch.td, ch.tdNum]}>{r.value}</Text>
            </View>
          ))}
        </View>
      ) : (
        children
      )}
    </View>
  );
}

const ch = StyleSheet.create({
  caption: { fontSize: 14, color: VIZ.ink, fontWeight: "600", marginBottom: 6 },
  captionLabel: { color: VIZ.inkSecondary, fontWeight: "400" },
  captionMuted: { color: VIZ.inkMuted, fontWeight: "400", fontSize: 12 },
  barHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 8,
  },
  barName: { fontSize: 14, color: VIZ.ink, flex: 1 },
  barValue: {
    fontSize: 14,
    color: VIZ.ink,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  barSub: { fontSize: 12, color: VIZ.inkMuted, marginTop: 3 },
  track: {
    height: 12,
    borderRadius: 4,
    backgroundColor: "#F0EFEC",
    overflow: "hidden",
  },
  fill: {
    height: 12,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: VIZ.series,
  },
  kpi: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 140,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  kpiLabel: { fontSize: 13, color: VIZ.inkSecondary },
  kpiValue: { fontSize: 24, fontWeight: "700", color: VIZ.ink, marginTop: 4 },
  kpiHint: { fontSize: 12, color: VIZ.inkMuted, marginTop: 2 },
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: VIZ.ink },
  cardSub: { fontSize: 12, color: VIZ.inkMuted, marginTop: 2 },
  toggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F0EFEC",
  },
  toggleText: { fontSize: 12, fontWeight: "600", color: VIZ.inkSecondary },
  tr: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  td: { fontSize: 14, color: VIZ.ink },
  tdNum: { fontVariant: ["tabular-nums"], fontWeight: "600" },
});
