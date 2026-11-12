import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BarList, ChartCard, ColumnChart, KpiTile, LineChart } from '@/components/charts';
import { HeatLegend, MapCell, SunbedMap } from '@/components/SunbedMap';
import { Banner, Chip, ChipRow, Label, Loading, Screen } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { managedBeaches } from '@/lib/roles';
import { euro, MONTHS, MONTHS_SHORT, parseISO, pct, shortDate } from '@/lib/dates';
import type { Beach, Stats } from '@/lib/types';

function monthBounds(year: number, month: number) {
  const last = new Date(year, month, 0).getDate();
  const p = (n: number) => String(n).padStart(2, '0');
  return { from: `${year}-${p(month)}-01`, to: `${year}-${p(month)}-${p(last)}` };
}

export default function DashboardScreen() {
  const { user, config } = useAuth();
  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [beachId, setBeachId] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heatPick, setHeatPick] = useState<MapCell | null>(null);

  useEffect(() => {
    api<Beach[]>('/beaches').then((list) => setBeaches(managedBeaches(user, list))).catch(() => {});
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = month && year ? monthBounds(year, month) : null;
      const data = await api<Stats>('/admin/stats', {
        query: { beach_id: beachId, date_from: range?.from, date_to: range?.to },
      });
      setStats(data);
      if (!year) setYear(Number(data.date_from.slice(0, 4)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [beachId, month, year]);

  useEffect(() => {
    load();
    setHeatPick(null);
  }, [load]);

  const seasonMonths = useMemo(() => {
    const a = config?.season_start_month ?? 5;
    const b = config?.season_end_month ?? 10;
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }, [config]);

  const k = stats?.kpis;
  const daily = stats?.daily ?? [];
  const revenueSeries = month
    ? daily.map((d) => ({ label: String(parseISO(d.date).getDate()), value: d.revenue, hint: shortDate(d.date) }))
    : (stats?.by_month ?? []).map((m) => ({ label: m.label, value: m.revenue, hint: MONTHS[Number(m.month.slice(5)) - 1] }));
  const occupancySeries = daily.map((d) => {
    const dt = parseISO(d.date);
    return { label: month ? String(dt.getDate()) : `${dt.getDate()}/${dt.getMonth() + 1}`, value: d.occupancy, hint: shortDate(d.date) };
  });

  return (
    <Screen topInset={false} onRefresh={load}>
      <Label>Παραλία</Label>
      <ChipRow>
        <Chip label="Όλες" selected={beachId === null} onPress={() => setBeachId(null)} />
        {beaches.map((b) => (
          <Chip key={b.id} label={b.name} selected={beachId === b.id} onPress={() => setBeachId(b.id)} />
        ))}
      </ChipRow>
      <Label>Περίοδος {year ?? ''}</Label>
      <ChipRow>
        <Chip label="Όλη η σεζόν" selected={month === null} onPress={() => setMonth(null)} />
        {seasonMonths.map((m) => (
          <Chip key={m} label={MONTHS_SHORT[m - 1]} selected={month === m} onPress={() => setMonth(m)} />
        ))}
      </ChipRow>

      {error ? <Banner text={error} /> : null}
      {loading && !stats ? <Loading /> : null}

      {stats && k ? (
        <View style={{ opacity: loading ? 0.5 : 1 }}>
          <Text style={st.period}>
            {shortDate(stats.date_from)} – {shortDate(stats.date_to)}
          </Text>
          <View style={st.kpis}>
            <KpiTile label="Έσοδα" value={euro(Math.round(k.revenue))} hint={`${k.customers} πελάτες`} />
            <KpiTile label="Κρατήσεις" value={k.bookings.toLocaleString('el-GR')} hint={`${k.cancelled} ακυρώσεις`} />
            <KpiTile label="Πληρότητα" value={pct(k.occupancy_rate)} hint={`${k.active_sunbeds} ξαπλώστρες`} />
            <KpiTile label="Μέση κράτηση" value={euro(k.avg_booking_value)} />
            <KpiTile label="Ακυρώσεις" value={pct(k.cancellation_rate)} />
            <KpiTile label="Check-in" value={pct(k.checkin_rate)} hint="των παλιών κρατήσεων" />
          </View>

          <ChartCard
            title={month ? 'Έσοδα ανά ημέρα' : 'Έσοδα ανά μήνα'}
            subtitle="Πάτα μια στήλη για την τιμή της"
            table={revenueSeries.map((d) => ({ label: d.hint ?? d.label, value: euro(d.value) }))}
          >
            <ColumnChart data={revenueSeries} format={(v) => euro(Math.round(v))} />
          </ChartCard>

          <ChartCard
            title="Πληρότητα ανά ημέρα"
            subtitle="Κλεισμένες ώρες / διαθέσιμες ώρες ξαπλωστρών · σύρε για τιμή"
            table={occupancySeries.map((d) => ({ label: d.hint ?? d.label, value: pct(d.value) }))}
          >
            <LineChart data={occupancySeries} format={(v) => `${Math.round(v * 100)}%`} max={1} />
          </ChartCard>

          <ChartCard
            title="Μέσες κρατήσεις ανά ημέρα εβδομάδας"
            table={stats.by_weekday.map((w) => ({ label: w.label, value: w.avg_bookings.toLocaleString('el-GR') }))}
          >
            <ColumnChart
              data={stats.by_weekday.map((w) => ({ label: w.label, value: w.avg_bookings }))}
              format={(v) => `${v.toLocaleString('el-GR', { maximumFractionDigits: 1 })} κρατήσεις`}
              height={150}
            />
          </ChartCard>

          <ChartCard title="Κρατήσεις ανά διάστημα">
            <BarList
              data={stats.by_slot.map((s) => ({ label: s.label, value: s.bookings, hint: euro(s.revenue) }))}
              format={(v) => v.toLocaleString('el-GR')}
              sub={(d) => `Έσοδα ${d.hint}`}
            />
          </ChartCard>

          {beachId === null ? (
            <ChartCard title="Έσοδα ανά παραλία">
              <BarList
                data={stats.by_beach.map((b) => ({ label: b.name, value: b.revenue, hint: `${b.bookings} κρατήσεις · πληρότητα ${pct(b.occupancy)}` }))}
                format={(v) => euro(Math.round(v))}
                sub={(d) => d.hint ?? ''}
              />
            </ChartCard>
          ) : stats.heatmap ? (
            <ChartCard title="Δημοφιλείς θέσεις" subtitle="Πιο σκούρο = περισσότερες κρατήσεις · πάτα μια θέση">
              <Text style={st.heatPick}>
                {heatPick
                  ? `Σειρά ${heatPick.grid_x}, θέση ${heatPick.grid_y}: ${heatPick.value} κρατήσεις`
                  : 'Επίλεξε μια ξαπλώστρα'}
              </Text>
              <SunbedMap
                mode="heat"
                rows={stats.heatmap.rows}
                cols={stats.heatmap.cols}
                maxValue={stats.heatmap.max_bookings}
                cells={stats.heatmap.cells.map((c) => ({ id: c.sunbed_id, grid_x: c.grid_x, grid_y: c.grid_y, type: c.type, status: c.status, value: c.bookings }))}
                selectedId={heatPick?.id}
                onSelect={setHeatPick}
              />
              <HeatLegend max={stats.heatmap.max_bookings} />
            </ChartCard>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  period: { fontSize: 13, color: C.textMuted, marginTop: 8, marginBottom: 8 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  heatPick: { fontSize: 14, color: C.text, fontWeight: '600' },
});
