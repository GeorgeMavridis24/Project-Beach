import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/brand';
import { bookableDays, fromMinutes, MONTHS_SHORT, parseISO, toMinutes, WEEKDAYS_SHORT } from '@/lib/dates';
import type { AppConfig } from '@/lib/types';

import { Chip, ChipRow, Label } from './ui';

/** Οριζόντια λωρίδα ημερομηνιών (μόνο ημέρες μέσα στη σεζόν). */
export function DateStrip({
  config,
  value,
  onChange,
}: {
  config: AppConfig | null;
  value: string;
  onChange: (iso: string) => void;
}) {
  const days = useMemo(() => {
    const list = bookableDays(config, 60);
    return list.includes(value) || !value ? list : [value, ...list];
  }, [config, value]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {days.map((iso) => {
        const d = parseISO(iso);
        const on = iso === value;
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        return (
          <Pressable
            key={iso}
            onPress={() => onChange(iso)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`}
            style={[ds.day, on && ds.dayOn]}
          >
            <Text style={[ds.dow, on && ds.on, weekend && !on && { color: C.primary }]}>{WEEKDAYS_SHORT[d.getDay()]}</Text>
            <Text style={[ds.num, on && ds.on]}>{d.getDate()}</Text>
            <Text style={[ds.month, on && ds.on]}>{MONTHS_SHORT[d.getMonth()]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export type TimeWindow = { start: string; end: string };

export function presets(config: AppConfig | null) {
  const open = config?.opening_time ?? '08:00';
  const close = config?.closing_time ?? '20:00';
  return [
    { key: 'morning', label: 'Πρωί', start: open, end: '14:00' },
    { key: 'afternoon', label: 'Απόγευμα', start: '14:00', end: close },
    { key: 'full', label: 'Ολοήμερο', start: open, end: close },
  ];
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={ds.stepper}>
      <Text style={ds.stepLabel}>{label}</Text>
      <View style={ds.stepRow}>
        <Pressable onPress={onMinus} style={ds.stepBtn} accessibilityLabel={`${label} νωρίτερα`}>
          <Ionicons name="remove" size={20} color={C.primary} />
        </Pressable>
        <Text style={ds.stepValue}>{value}</Text>
        <Pressable onPress={onPlus} style={ds.stepBtn} accessibilityLabel={`${label} αργότερα`}>
          <Ionicons name="add" size={20} color={C.primary} />
        </Pressable>
      </View>
    </View>
  );
}

/** Επιλογή χρονικού διαστήματος: έτοιμες επιλογές ή προσαρμογή ανά 30'. */
export function TimeWindowPicker({
  config,
  value,
  onChange,
  showLabel = true,
}: {
  config: AppConfig | null;
  value: TimeWindow;
  onChange: (w: TimeWindow) => void;
  showLabel?: boolean;
}) {
  const list = presets(config);
  const current = list.find((p) => p.start === value.start && p.end === value.end);
  const [custom, setCustom] = React.useState(!current);
  const open = toMinutes(config?.opening_time ?? '08:00');
  const close = toMinutes(config?.closing_time ?? '20:00');
  const minLen = Math.max(30, config?.min_booking_minutes ?? 60);
  const start = toMinutes(value.start);
  const end = toMinutes(value.end);

  const set = (s: number, e: number) => {
    s = Math.max(open, Math.min(s, close - minLen));
    e = Math.min(close, Math.max(e, s + minLen));
    onChange({ start: fromMinutes(s), end: fromMinutes(e) });
  };

  return (
    <View>
      {showLabel ? <Label>Ώρες</Label> : null}
      <ChipRow>
        {list.map((p) => (
          <Chip
            key={p.key}
            label={`${p.label} ${p.start}-${p.end}`}
            selected={!custom && current?.key === p.key}
            onPress={() => {
              setCustom(false);
              onChange({ start: p.start, end: p.end });
            }}
          />
        ))}
        <Chip label="Άλλες ώρες" icon="time-outline" selected={custom || !current} onPress={() => setCustom(true)} />
      </ChipRow>
      {custom || !current ? (
        <View style={ds.steppers}>
          <Stepper label="Άφιξη" value={value.start} onMinus={() => set(start - 30, end)} onPlus={() => set(start + 30, end)} />
          <Stepper label="Αναχώρηση" value={value.end} onMinus={() => set(start, end - 30)} onPlus={() => set(start, end + 30)} />
        </View>
      ) : null}
    </View>
  );
}

const ds = StyleSheet.create({
  day: {
    width: 58,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  dayOn: { backgroundColor: C.primary, borderColor: C.primary },
  dow: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  num: { fontSize: 20, fontWeight: '700', color: C.text, marginVertical: 1 },
  month: { fontSize: 11, color: C.textMuted },
  on: { color: '#FFFFFF' },
  steppers: { flexDirection: 'row', gap: 12, marginTop: 10 },
  stepper: { flex: 1, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 10 },
  stepLabel: { fontSize: 12, color: C.textMuted, fontWeight: '600', textAlign: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 20, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
});
