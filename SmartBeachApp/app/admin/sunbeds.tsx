import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MapCell, MapLegend, SunbedMap } from '@/components/SunbedMap';
import { Badge, Banner, Button, Card, Chip, ChipRow, Field, Label, Loading, Screen, Segmented } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/dialogs';
import type { Beach, Sunbed, SunbedMap as MapData } from '@/lib/types';

export default function AdminSunbedsScreen() {
  const { config } = useAuth();
  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [beachId, setBeachId] = useState<number | null>(null);
  const [map, setMap] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // γεννήτρια πλέγματος
  const [rows, setRows] = useState('4');
  const [cols, setCols] = useState('8');
  const [premiumRows, setPremiumRows] = useState('1');
  const [premiumPrice, setPremiumPrice] = useState('25');
  const [price, setPrice] = useState('12');

  // επεξεργασία μίας ξαπλώστρας
  const [selected, setSelected] = useState<Sunbed | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editType, setEditType] = useState<'normal' | 'premium'>('normal');
  const [editStatus, setEditStatus] = useState<'active' | 'out_of_order'>('active');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Beach[]>('/beaches')
      .then((list) => {
        setBeaches(list);
        setBeachId((cur) => cur ?? list[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async () => {
    if (!beachId || !config) return;
    setLoading(true);
    setError(null);
    try {
      setMap(await api<MapData>(`/beaches/${beachId}/sunbeds`, { query: { date: config.first_bookable_date } }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [beachId, config]);

  useEffect(() => {
    setSelected(null);
    setMessage(null);
    load();
  }, [load]);

  const select = (cell: MapCell) => {
    const s = map?.sunbeds.find((x) => x.id === cell.id) ?? null;
    setSelected(s);
    if (s) {
      setEditPrice(String(s.price));
      setEditType(s.type);
      setEditStatus(s.status === 'out_of_order' ? 'out_of_order' : 'active');
    }
  };

  const generate = async () => {
    setError(null);
    try {
      const res = await api<{ created: number }>(`/admin/beaches/${beachId}/sunbeds/grid`, {
        method: 'POST',
        body: {
          rows: Number(rows),
          cols: Number(cols),
          premium_rows: Number(premiumRows),
          premium_price: Number(premiumPrice.replace(',', '.')),
          price: Number(price.replace(',', '.')),
        },
      });
      setMessage(`Δημιουργήθηκαν ${res.created} ξαπλώστρες.`);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const clearAll = async () => {
    const ok = await confirm('Διαγραφή όλων', 'Θα διαγραφούν όλες οι ξαπλώστρες αυτής της παραλίας και το ιστορικό τους. Συνέχεια;', 'Διαγραφή', true);
    if (!ok) return;
    setError(null);
    try {
      const res = await api<{ deleted: number }>(`/admin/beaches/${beachId}/sunbeds`, { method: 'DELETE' });
      setMessage(`Διαγράφηκαν ${res.deleted} ξαπλώστρες.`);
      setSelected(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/admin/sunbeds/${selected.id}`, {
        method: 'PUT',
        body: { price: Number(editPrice.replace(',', '.')), type: editType, status: editStatus },
      });
      setMessage(`Η θέση ${selected.grid_x}-${selected.grid_y} ενημερώθηκε.`);
      setSelected(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const count = map?.summary.total ?? 0;
  const vip = map?.sunbeds.filter((s) => s.type === 'premium').length ?? 0;

  return (
    <Screen topInset={false} onRefresh={load}>
      <Label>Παραλία</Label>
      <ChipRow>
        {beaches.map((b) => (
          <Chip key={b.id} label={b.name} selected={beachId === b.id} onPress={() => setBeachId(b.id)} />
        ))}
      </ChipRow>
      {error ? <Banner text={error} /> : null}
      {message ? <Banner text={message} tone="success" /> : null}
      {loading && !map ? <Loading /> : null}

      {map && count === 0 ? (
        <Card>
          <Text style={st.cardTitle}>Γεννήτρια πλέγματος</Text>
          <Text style={st.help}>Οι πρώτες σειρές (πιο κοντά στη θάλασσα) γίνονται VIP.</Text>
          <View style={st.row}>
            <Field label="Σειρές" value={rows} onChangeText={setRows} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
            <View style={{ width: 10 }} />
            <Field label="Θέσεις ανά σειρά" value={cols} onChangeText={setCols} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
          </View>
          <Field label="VIP σειρές" value={premiumRows} onChangeText={setPremiumRows} keyboardType="number-pad" />
          <View style={st.row}>
            <Field label="Τιμή VIP (€)" value={premiumPrice} onChangeText={setPremiumPrice} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
            <View style={{ width: 10 }} />
            <Field label="Τιμή κανονικής (€)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
          </View>
          <Button title="Δημιουργία ξαπλωστρών" icon="sparkles-outline" onPress={generate} />
        </Card>
      ) : null}

      {map && count > 0 ? (
        <>
          <View style={st.stats}>
            <Badge text={`${count} θέσεις`} tone="primary" />
            <Badge text={`${vip} VIP`} tone="warning" />
            <Badge text={`${map.summary.out_of_order} εκτός λειτουργίας`} tone={map.summary.out_of_order ? 'danger' : 'neutral'} />
          </View>
          <MapLegend mode="admin" />
          <SunbedMap mode="admin" rows={map.rows} cols={map.cols} cells={map.sunbeds} selectedId={selected?.id} onSelect={select} />
          {selected ? (
            <Card style={{ borderColor: C.primary, borderWidth: 1.5 }}>
              <Text style={st.cardTitle}>
                Σειρά {selected.grid_x} · Θέση {selected.grid_y}
              </Text>
              <Field label="Τιμή ημέρας (€)" value={editPrice} onChangeText={setEditPrice} keyboardType="decimal-pad" />
              <Label>Τύπος</Label>
              <Segmented
                options={[
                  { value: 'normal', label: 'Κανονική' },
                  { value: 'premium', label: 'VIP' },
                ]}
                value={editType}
                onChange={setEditType}
              />
              <Label>Κατάσταση</Label>
              <Segmented
                options={[
                  { value: 'active', label: 'Σε λειτουργία' },
                  { value: 'out_of_order', label: 'Εκτός λειτουργίας' },
                ]}
                value={editStatus}
                onChange={setEditStatus}
              />
              <Button title="Αποθήκευση" onPress={save} loading={saving} />
            </Card>
          ) : (
            <Text style={st.help}>Πάτησε μια ξαπλώστρα για να αλλάξεις τιμή, τύπο ή κατάσταση.</Text>
          )}
          <Button title="Διαγραφή όλων των ξαπλωστρών" icon="trash-outline" variant="danger" onPress={clearAll} style={{ marginTop: 16 }} />
        </>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  cardTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 6 },
  help: { fontSize: 14, color: C.textMuted, marginBottom: 12 },
  row: { flexDirection: 'row' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
});
