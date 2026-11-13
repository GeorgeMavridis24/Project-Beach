import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { C, MAP, VIZ } from '@/constants/brand';
import type { SunbedType } from '@/lib/types';

export type MapCell = {
  id: number;
  grid_x: number;
  grid_y: number;
  type: SunbedType;
  status?: 'available' | 'booked' | 'out_of_order' | 'active' | string;
  value?: number; // για heatmap
  dim?: boolean; // δεν ταιριάζει στα φίλτρα
};

type Mode = 'book' | 'admin' | 'heat';

const ROW_LABEL = 30;
const GAP = 4;

export function rampColor(value: number, max: number): string {
  if (max <= 0) return VIZ.ramp[0];
  const i = Math.round((value / max) * (VIZ.ramp.length - 1));
  return VIZ.ramp[Math.max(0, Math.min(VIZ.ramp.length - 1, i))];
}

function cellStyle(cell: MapCell, mode: Mode, max: number) {
  if (mode === 'heat') {
    const bg = rampColor(cell.value ?? 0, max);
    const dark = VIZ.ramp.indexOf(bg) >= 6;
    return { bg, fg: dark ? '#FFFFFF' : VIZ.ink, mark: '' };
  }
  if (cell.status === 'out_of_order') return { bg: MAP.outOfOrder, fg: '#FFFFFF', mark: '!' };
  if (mode === 'book' && cell.status === 'booked') return { bg: MAP.booked, fg: MAP.onBooked, mark: '✕' };
  if (cell.type === 'premium') return { bg: MAP.premium, fg: MAP.onPremium, mark: '★' };
  return { bg: MAP.normal, fg: MAP.onNormal, mark: '' };
}

function describe(cell: MapCell, mode: Mode) {
  const type = cell.type === 'premium' ? 'VIP' : 'κανονική';
  const state =
    mode === 'heat'
      ? `${cell.value ?? 0} κρατήσεις`
      : cell.status === 'out_of_order'
        ? 'εκτός λειτουργίας'
        : cell.status === 'booked'
          ? 'κλεισμένη'
          : 'ελεύθερη';
  return `Σειρά ${cell.grid_x}, θέση ${cell.grid_y}, ${type}, ${state}`;
}

/**
 * Οπτικός χάρτης παραλίας. Η σειρά 1 είναι πιο κοντά στη θάλασσα (πάνω).
 */
export function SunbedMap({
  rows,
  cols,
  cells,
  selectedId,
  onSelect,
  mode = 'book',
  maxValue = 0,
}: {
  rows: number;
  cols: number;
  cells: MapCell[];
  selectedId?: number | null;
  onSelect?: (cell: MapCell) => void;
  mode?: Mode;
  maxValue?: number;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const avail = Math.max(0, width - ROW_LABEL - 16);
  const size = Math.max(26, Math.min(46, Math.floor((avail - GAP * (cols - 1)) / Math.max(cols, 1))));
  const byPos = new Map(cells.map((c) => [`${c.grid_x}-${c.grid_y}`, c]));

  return (
    <View onLayout={onLayout} style={m.wrap}>
      <View style={m.sea}>
        <Ionicons name="water" size={16} color="#FFFFFF" />
        <Text style={m.seaText}>Θάλασσα</Text>
      </View>
      {width > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={m.sand}>
          <View>
            {Array.from({ length: rows }, (_, r) => r + 1).map((x) => (
              <View key={x} style={[m.row, { marginBottom: GAP }]}>
                <Text style={m.rowLabel}>Σ{x}</Text>
                {Array.from({ length: cols }, (_, c) => c + 1).map((y) => {
                  const cell = byPos.get(`${x}-${y}`);
                  if (!cell) return <View key={y} style={{ width: size, height: size, marginRight: GAP }} />;
                  const st = cellStyle(cell, mode, maxValue);
                  const selected = cell.id === selectedId;
                  return (
                    <Pressable
                      key={y}
                      onPress={() => onSelect?.(cell)}
                      accessibilityRole="button"
                      accessibilityLabel={describe(cell, mode)}
                      accessibilityState={{ selected, disabled: cell.dim }}
                      hitSlop={2}
                      style={[
                        m.cell,
                        {
                          width: size,
                          height: size,
                          marginRight: GAP,
                          backgroundColor: st.bg,
                          opacity: cell.dim ? 0.22 : 1,
                        },
                        selected && m.selected,
                      ]}
                    >
                      {selected ? (
                        <Ionicons name="checkmark" size={size * 0.55} color={st.fg} />
                      ) : (
                        <Text style={[m.cellText, { color: st.fg, fontSize: size > 34 ? 12 : 10 }]}>
                          {st.mark || (mode === 'heat' ? '' : y)}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function Swatch({ color, label, mark, fg }: { color: string; label: string; mark?: string; fg?: string }) {
  return (
    <View style={m.legendItem}>
      <View style={[m.swatch, { backgroundColor: color }]}>
        {mark ? <Text style={{ fontSize: 9, color: fg ?? '#FFF', fontWeight: '700' }}>{mark}</Text> : null}
      </View>
      <Text style={m.legendText}>{label}</Text>
    </View>
  );
}

export function MapLegend({ mode = 'book' }: { mode?: 'book' | 'admin' }) {
  return (
    <View style={m.legend}>
      <Swatch color={MAP.normal} label="Κανονική" />
      <Swatch color={MAP.premium} label="VIP" mark="★" fg={MAP.onPremium} />
      {mode === 'book' ? <Swatch color={MAP.booked} label="Κλεισμένη" mark="✕" fg={MAP.onBooked} /> : null}
      <Swatch color={MAP.outOfOrder} label="Εκτός λειτουργίας" mark="!" />
    </View>
  );
}

export function HeatLegend({ max }: { max: number }) {
  return (
    <View style={m.heatLegend}>
      <Text style={m.legendText}>0</Text>
      <View style={m.heatBar}>
        {VIZ.ramp.map((c) => (
          <View key={c} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </View>
      <Text style={m.legendText}>{max} κρατήσεις</Text>
    </View>
  );
}

const m = StyleSheet.create({
  wrap: { borderRadius: 14, overflow: 'hidden', backgroundColor: C.sand, marginVertical: 8 },
  sea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: C.seaDeep,
  },
  seaText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13, letterSpacing: 0.5 },
  sand: { padding: 8, paddingTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { width: ROW_LABEL, fontSize: 11, color: C.textMuted, fontWeight: '600' },
  cell: { borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  selected: { borderWidth: 3, borderColor: MAP.selected, transform: [{ scale: 1.08 }] },
  cellText: { fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 16, height: 16, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  legendText: { fontSize: 12, color: C.textMuted },
  heatLegend: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  heatBar: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', gap: 1 },
});

/** Κελιά για προεπισκόπηση διάταξης (πριν υπάρξουν ξαπλώστρες στη βάση). */
export function previewCells(rows: number, cols: number, premiumRows: number): MapCell[] {
  const cells: MapCell[] = [];
  let id = 1;
  for (let x = 1; x <= rows; x++) {
    for (let y = 1; y <= cols; y++) {
      cells.push({ id: id++, grid_x: x, grid_y: y, type: x <= premiumRows ? 'premium' : 'normal', status: 'available' });
    }
  }
  return cells;
}
