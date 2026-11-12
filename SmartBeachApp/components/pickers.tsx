import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { C } from '@/constants/brand';
import { bookableDays, fromMinutes, MONTHS_SHORT, parseISO, toMinutes, WEEKDAYS_SHORT } from '@/lib/dates';
import type { AppConfig } from '@/lib/types';


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

const STEP = 15; // λεπτά ανά πάτημα των κουμπιών -/+ (με πληκτρολόγηση: οποιοδήποτε λεπτό)

/** "9" / "930" / "9:30" / "09.30" -> λεπτά από τα μεσάνυχτα (ή null αν είναι άκυρο) */
export function parseTyped(text: string): number | null {
  const t = text.trim().replace(/[.,h ]/g, ':');
  let h: number;
  let m = 0;
  if (/^\d{1,2}$/.test(t)) h = Number(t);
  else if (/^\d{3,4}$/.test(t)) {
    h = Number(t.slice(0, -2));
    m = Number(t.slice(-2));
  } else if (/^\d{1,2}:\d{1,2}$/.test(t)) [h, m] = t.split(':').map(Number);
  else return null;
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Μία ώρα: κουμπιά -/+ ανά 15' και πάτημα πάνω στην ώρα για πληκτρολόγηση. */
export function TimeField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  onChange: (hhmm: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const cur = toMinutes(value);
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const commit = () => {
    const parsed = parseTyped(text);
    if (parsed !== null) onChange(fromMinutes(clamp(parsed)));
    else setText(value);
    setEditing(false);
  };
  const step = (dir: 1 | -1) => {
    // στρογγυλοποίηση στο επόμενο τέταρτο, π.χ. 10:07 -> 10:15
    const next = dir > 0 ? Math.floor(cur / STEP) * STEP + STEP : Math.ceil(cur / STEP) * STEP - STEP;
    onChange(fromMinutes(clamp(next)));
  };
  return (
    <View style={ds.stepper}>
      <Text style={ds.stepLabel}>{label}</Text>
      <View style={ds.stepRow}>
        <Pressable onPress={() => step(-1)} style={ds.stepBtn} accessibilityLabel={`${label} νωρίτερα`}>
          <Ionicons name="remove" size={20} color={C.primary} />
        </Pressable>
        {editing ? (
          <TextInput
            value={text}
            onChangeText={setText}
            onBlur={commit}
            onSubmitEditing={commit}
            autoFocus
            selectTextOnFocus
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            style={[ds.stepValue, ds.stepInput]}
            accessibilityLabel={`${label}, γράψε ώρα`}
          />
        ) : (
          <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel={`${label} ${value}, πάτα για να γράψεις ώρα`}>
            <Text style={[ds.stepValue, ds.underline]}>{value}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => step(1)} style={ds.stepBtn} accessibilityLabel={`${label} αργότερα`}>
          <Ionicons name="add" size={20} color={C.primary} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Ελεύθερη επιλογή ώρας άφιξης και αναχώρησης μέσα στο ωράριο του καταστήματος.
 * open/close: ωράριο (π.χ. "08:00", "22:00").
 */
export function TimeRangePicker({
  open,
  close,
  value,
  onChange,
  minMinutes = 60,
  showHours = true,
}: {
  open: string;
  close: string;
  value: TimeWindow;
  onChange: (w: TimeWindow) => void;
  minMinutes?: number;
  showHours?: boolean;
}) {
  const o = toMinutes(open);
  const c = toMinutes(close);
  const s = toMinutes(value.start);
  const e = toMinutes(value.end);
  const fullDay = value.start === open && value.end === close;
  const setStart = (hhmm: string) => {
    const ns = Math.min(toMinutes(hhmm), c - minMinutes);
    onChange({ start: fromMinutes(ns), end: fromMinutes(Math.max(e, ns + minMinutes)) });
  };
  const setEnd = (hhmm: string) => {
    const ne = Math.max(toMinutes(hhmm), o + minMinutes);
    onChange({ start: fromMinutes(Math.min(s, ne - minMinutes)), end: fromMinutes(ne) });
  };
  return (
    <View>
      {showHours ? (
        <View style={ds.hoursRow}>
          <Ionicons name="time-outline" size={16} color={C.textMuted} />
          <Text style={ds.hoursText}>
            Ωράριο καταστήματος: <Text style={{ fontWeight: '700', color: C.text }}>{open} – {close}</Text>
          </Text>
          {!fullDay ? (
            <Pressable onPress={() => onChange({ start: open, end: close })} accessibilityRole="button" hitSlop={8}>
              <Text style={ds.link}>Όλη μέρα</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={ds.steppers}>
        <TimeField label="Άφιξη" value={value.start} min={o} max={c - minMinutes} onChange={setStart} />
        <TimeField label="Αναχώρηση" value={value.end} min={o + minMinutes} max={c} onChange={setEnd} />
      </View>
    </View>
  );
}

/** Ταιριάζει ένα διάστημα στο ωράριο; Αν όχι, επιστρέφει όλο το ωράριο. */
export function fitWindow(w: TimeWindow | null, open: string, close: string): TimeWindow {
  if (w && toMinutes(w.start) >= toMinutes(open) && toMinutes(w.end) <= toMinutes(close) && toMinutes(w.end) > toMinutes(w.start)) {
    return w;
  }
  return { start: open, end: close };
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
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  hoursText: { fontSize: 14, color: C.textMuted, flexShrink: 1 },
  link: { fontSize: 14, color: C.primary, fontWeight: '700', marginLeft: 6 },
  steppers: { flexDirection: 'row', gap: 12, marginTop: 10 },
  stepper: { flex: 1, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 10 },
  stepLabel: { fontSize: 12, color: C.textMuted, fontWeight: '600', textAlign: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 20, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'center' },
  underline: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  stepInput: { borderBottomWidth: 2, borderBottomColor: C.primary, paddingVertical: 2 },
});
