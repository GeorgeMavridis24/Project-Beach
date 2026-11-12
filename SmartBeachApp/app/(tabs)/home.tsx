import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { BeachMap, MapPin } from '@/components/BeachMap';
import { openDirections, PIN_COLORS } from '@/components/beachMapShared';
import { DateStrip, TimeRangePicker, TimeWindow } from '@/components/pickers';
import { Badge, Banner, Button, Card, Chip, ChipRow, Empty, Label, Loading, Screen, Segmented } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { euro, longDate } from '@/lib/dates';
import { confirm } from '@/lib/dialogs';
import type { Beach, SunbedType } from '@/lib/types';

type Sort = 'name' | 'price' | 'availability' | 'distance';
const PRICES = [10, 15, 20, 30];
const SORTS: { value: Sort; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'availability', label: 'Διαθεσιμότητα', icon: 'checkmark-done-outline' },
  { value: 'price', label: 'Φθηνότερες', icon: 'pricetag-outline' },
  { value: 'distance', label: 'Κοντινότερες', icon: 'navigate-outline' },
  { value: 'name', label: 'Όνομα', icon: 'text-outline' },
];

export default function BeachesScreen() {
  const router = useRouter();
  const { user, config, logout } = useAuth();

  const [view, setView] = useState<'list' | 'map'>('list');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [date, setDate] = useState('');
  const [win, setWin] = useState<TimeWindow | null>(null); // null = οποιαδήποτε ώρα (όλο το ωράριο)
  const [type, setType] = useState<SunbedType | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('availability');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (config && !date) setDate(config.first_bookable_date);
  }, [config, date]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useMemo(
    () => ({
      q: debouncedQ,
      date: date || undefined,
      start_time: win?.start,
      end_time: win?.end,
      type,
      max_price: maxPrice,
      available_only: availableOnly,
      sort: sort === 'distance' && !coords ? 'name' : sort,
      lat: coords?.lat,
      lon: coords?.lon,
    }),
    [debouncedQ, date, win, type, maxPrice, availableOnly, sort, coords],
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBeaches(await api<Beach[]>('/beaches', { query }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (date) load();
  }, [load, date]);

  const chooseSort = async (value: Sort) => {
    setSort(value);
    if (value === 'distance' && !coords) {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          setError('Χωρίς άδεια τοποθεσίας δεν μπορούμε να βρούμε τις κοντινότερες παραλίες.');
          setSort('availability');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      } catch {
        setError('Δεν βρέθηκε η τοποθεσία σου.');
        setSort('availability');
      }
    }
  };

  // Για τα όρια της επιλογής ώρας: από το νωρίτερο άνοιγμα ως το αργότερο κλείσιμο
  const bounds = useMemo(() => {
    if (!beaches.length) return { open: config?.default_open_time ?? '08:00', close: config?.default_close_time ?? '20:00' };
    const open = beaches.map((b) => b.open_time).sort()[0];
    const close = beaches.map((b) => b.close_time).sort().slice(-1)[0];
    return { open, close };
  }, [beaches, config]);

  const activeFilters = [type, maxPrice, availableOnly || null].filter(Boolean).length;
  const resetFilters = () => {
    setType(null);
    setMaxPrice(null);
    setAvailableOnly(false);
  };

  const onLogout = async () => {
    if (await confirm('Αποσύνδεση', 'Θέλεις να αποσυνδεθείς;', 'Αποσύνδεση')) logout();
  };

  const goBook = (b: Beach) =>
    router.push({
      pathname: '/book',
      params: { beachId: String(b.id), date, start: win?.start ?? '', end: win?.end ?? '', type: type ?? '' },
    });

  const pins: MapPin[] = beaches.map((b) => ({
    id: b.id,
    lat: b.ltd,
    lng: b.lgd,
    title: b.name,
    subtitle: `${b.open_time}–${b.close_time}${b.available_sunbeds !== null ? ` · ${b.available_sunbeds} ελεύθερες` : ''}${b.min_price !== null ? ` · από ${euro(b.min_price)}` : ''}`,
    tone: b.open_for_window === false ? 'closed' : b.available_sunbeds === 0 ? 'full' : b.available_sunbeds ? 'ok' : 'none',
  }));

  const renderBeach = (b: Beach) => {
    const closed = b.open_for_window === false;
    const soldOut = !closed && b.available_sunbeds === 0;
    return (
      <Card key={b.id} style={selected === b.id && view === 'map' ? { borderColor: C.primary, borderWidth: 1.5 } : undefined}>
        <View style={st.cardHead}>
          <Text style={st.beachName}>{b.name}</Text>
          {closed ? (
            <Badge text="Κλειστό αυτές τις ώρες" tone="neutral" icon="moon-outline" />
          ) : b.available_sunbeds !== null ? (
            <Badge
              text={soldOut ? 'Πλήρες' : `${b.available_sunbeds} ελεύθερες`}
              tone={soldOut ? 'danger' : 'success'}
              icon={soldOut ? 'close-circle' : 'checkmark-circle'}
            />
          ) : null}
        </View>
        {b.description ? <Text style={st.desc}>{b.description}</Text> : null}
        <View style={st.meta}>
          <Meta icon="time-outline" text={`${b.open_time}–${b.close_time}`} />
          <Meta icon="pricetag-outline" text={b.min_price !== null ? `από ${euro(b.min_price)}` : 'Χωρίς ξαπλώστρες'} />
          <Meta icon="star-outline" text={`${b.premium_sunbeds} VIP`} />
          <Meta icon="grid-outline" text={`${b.total_sunbeds} θέσεις`} />
          {b.distance_km !== null ? <Meta icon="navigate-outline" text={`${b.distance_km.toLocaleString('el-GR')} km`} /> : null}
        </View>
        <View style={st.actions}>
          <Button title="Κράτηση" icon="calendar-outline" disabled={!b.total_sunbeds} onPress={() => goBook(b)} small style={{ flex: 1 }} />
          <Button title="Οδηγίες" icon="navigate-outline" variant="secondary" onPress={() => openDirections(b.ltd, b.lgd)} small style={{ flex: 1 }} />
        </View>
      </Card>
    );
  };

  return (
    <Screen
      title={`Γεια σου, ${user?.username ?? ''}`}
      subtitle="Βρες την ιδανική ξαπλώστρα"
      onRefresh={load}
      refreshing={false}
      right={
        <Pressable onPress={onLogout} accessibilityRole="button" accessibilityLabel="Αποσύνδεση" style={st.iconBtn}>
          <Ionicons name="log-out-outline" size={22} color={C.textMuted} />
        </Pressable>
      }
    >
      <View style={st.search}>
        <Ionicons name="search" size={18} color={C.textFaint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Αναζήτηση παραλίας…"
          placeholderTextColor={C.textFaint}
          style={st.searchInput}
          accessibilityLabel="Αναζήτηση παραλίας"
        />
        {q ? (
          <Pressable onPress={() => setQ('')} accessibilityLabel="Καθαρισμός αναζήτησης">
            <Ionicons name="close-circle" size={18} color={C.textFaint} />
          </Pressable>
        ) : null}
      </View>

      <Label>Ημερομηνία</Label>
      <DateStrip config={config} value={date} onChange={setDate} />

      <Label>Ώρες</Label>
      <ChipRow>
        <Chip label="Οποιαδήποτε ώρα" selected={!win} onPress={() => setWin(null)} />
        <Chip
          label="Συγκεκριμένες ώρες"
          icon="time-outline"
          selected={!!win}
          onPress={() => setWin(win ?? { start: '10:00', end: '14:00' })}
        />
      </ChipRow>
      {win ? <TimeRangePicker open={bounds.open} close={bounds.close} value={win} onChange={setWin} showHours={false} /> : null}

      <View style={st.filterBar}>
        <Chip
          label={activeFilters ? `Φίλτρα (${activeFilters})` : 'Φίλτρα'}
          icon="options-outline"
          selected={showFilters}
          onPress={() => setShowFilters(!showFilters)}
        />
        <View style={{ flex: 1 }}>
          <ChipRow>
            {SORTS.map((s) => (
              <Chip key={s.value} label={s.label} icon={s.icon} selected={sort === s.value} onPress={() => chooseSort(s.value)} />
            ))}
          </ChipRow>
        </View>
      </View>

      {showFilters ? (
        <Card>
          <Label>Τύπος ξαπλώστρας</Label>
          <ChipRow wrap>
            <Chip label="Όλες" selected={!type} onPress={() => setType(null)} />
            <Chip label="Κανονική" selected={type === 'normal'} onPress={() => setType('normal')} />
            <Chip label="VIP ★" selected={type === 'premium'} onPress={() => setType('premium')} />
          </ChipRow>
          <Label>Μέγιστη τιμή ημέρας</Label>
          <ChipRow wrap>
            <Chip label="Χωρίς όριο" selected={maxPrice === null} onPress={() => setMaxPrice(null)} />
            {PRICES.map((p) => (
              <Chip key={p} label={`έως ${p} €`} selected={maxPrice === p} onPress={() => setMaxPrice(p)} />
            ))}
          </ChipRow>
          <View style={st.switchRow}>
            <Text style={st.switchText}>Μόνο με ελεύθερες θέσεις</Text>
            <Switch
              value={availableOnly}
              onValueChange={setAvailableOnly}
              trackColor={{ true: C.primary, false: C.border }}
              accessibilityLabel="Μόνο με ελεύθερες θέσεις"
            />
          </View>
          {activeFilters ? <Button title="Καθαρισμός φίλτρων" variant="ghost" small onPress={resetFilters} /> : null}
        </Card>
      ) : null}

      <View style={{ marginTop: 8 }}>
        <Segmented
          options={[
            { value: 'list', label: 'Λίστα' },
            { value: 'map', label: 'Χάρτης' },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      {error ? <Banner text={error} /> : null}
      {date ? (
        <Text style={st.resultsInfo}>
          {beaches.length} {beaches.length === 1 ? 'παραλία' : 'παραλίες'} · {longDate(date)}
          {win ? ` · ${win.start}-${win.end}` : ' · όλο το ωράριο'}
        </Text>
      ) : null}

      {loading && !beaches.length ? (
        <Loading />
      ) : beaches.length === 0 ? (
        <Empty text="Καμία παραλία δεν ταιριάζει στα φίλτρα σου." icon="search-outline" />
      ) : view === 'map' ? (
        <>
          <BeachMap pins={pins} selectedId={selected} onSelect={setSelected} height={360} />
          <View style={st.legend}>
            <LegendDot color={PIN_COLORS.ok} text="Ελεύθερες θέσεις" />
            <LegendDot color={PIN_COLORS.full} text="Πλήρες" />
            <LegendDot color={PIN_COLORS.closed} text="Κλειστό αυτές τις ώρες" />
          </View>
          {selected ? (
            beaches.filter((b) => b.id === selected).map(renderBeach)
          ) : (
            <Text style={st.hint}>Πάτα μια πινέζα για λεπτομέρειες.</Text>
          )}
        </>
      ) : (
        beaches.map(renderBeach)
      )}
    </Screen>
  );
}

function Meta({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={st.metaItem}>
      <Ionicons name={icon} size={14} color={C.textMuted} />
      <Text style={st.metaText}>{text}</Text>
    </View>
  );
}

function LegendDot({ color, text }: { color: string; text: string }) {
  return (
    <View style={st.metaItem}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={st.metaText}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: C.text },
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 4 },
  switchText: { fontSize: 15, color: C.text },
  resultsInfo: { fontSize: 13, color: C.textMuted, marginBottom: 8 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  beachName: { fontSize: 18, fontWeight: '700', color: C.text, flex: 1 },
  desc: { fontSize: 14, color: C.textMuted, marginTop: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginVertical: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: C.textMuted },
  actions: { flexDirection: 'row', gap: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 8 },
  hint: { fontSize: 14, color: C.textMuted, textAlign: 'center', marginTop: 4 },
});
