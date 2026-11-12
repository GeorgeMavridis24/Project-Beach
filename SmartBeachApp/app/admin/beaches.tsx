import * as Location from 'expo-location';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Field, Loading, Screen } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { confirm } from '@/lib/dialogs';
import type { Beach } from '@/lib/types';

type Form = { name: string; description: string; ltd: string; lgd: string };
const EMPTY: Form = { name: '', description: '', ltd: '', lgd: '' };

export default function AdminBeachesScreen() {
  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBeaches(await api<Beach[]>('/beaches'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const start = (b?: Beach) => {
    setError(null);
    setEditing(b ? b.id : 'new');
    setForm(b ? { name: b.name, description: b.description, ltd: String(b.ltd), lgd: String(b.lgd) } : EMPTY);
  };

  const useMyLocation = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return setError('Δεν δόθηκε άδεια τοποθεσίας.');
      const pos = await Location.getCurrentPositionAsync({});
      setForm((f) => ({ ...f, ltd: pos.coords.latitude.toFixed(6), lgd: pos.coords.longitude.toFixed(6) }));
    } catch {
      setError('Δεν βρέθηκε η τοποθεσία.');
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      ltd: Number(form.ltd.replace(',', '.')),
      lgd: Number(form.lgd.replace(',', '.')),
    };
    try {
      if (editing === 'new') await api('/admin/beaches', { method: 'POST', body });
      else await api(`/admin/beaches/${editing}`, { method: 'PUT', body });
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b: Beach) => {
    const ok = await confirm('Διαγραφή παραλίας', `Θα διαγραφεί η «${b.name}» μαζί με τις ξαπλώστρες και τις κρατήσεις της.`, 'Διαγραφή', true);
    if (!ok) return;
    try {
      await api(`/admin/beaches/${b.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const formCard = (
    <Card style={{ borderColor: C.primary, borderWidth: 1.5 }}>
      <Text style={st.title}>{editing === 'new' ? 'Νέα παραλία' : 'Επεξεργασία'}</Text>
      {error ? <Banner text={error} /> : null}
      <Field label="Όνομα" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
      <Field label="Περιγραφή" value={form.description} onChangeText={(description) => setForm({ ...form, description })} multiline />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="Γεωγρ. πλάτος" value={form.ltd} onChangeText={(ltd) => setForm({ ...form, ltd })} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
        <Field label="Γεωγρ. μήκος" value={form.lgd} onChangeText={(lgd) => setForm({ ...form, lgd })} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
      </View>
      <Button title="Η τρέχουσα τοποθεσία μου" icon="locate-outline" variant="ghost" small onPress={useMyLocation} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <Button title="Αποθήκευση" onPress={save} loading={saving} style={{ flex: 1 }} />
        <Button title="Άκυρο" variant="secondary" onPress={() => setEditing(null)} style={{ flex: 1 }} />
      </View>
    </Card>
  );

  return (
    <Screen topInset={false} onRefresh={load}>
      {editing === 'new' ? formCard : <Button title="Νέα παραλία" icon="add" onPress={() => start()} style={{ marginBottom: 12 }} />}
      {error && editing === null ? <Banner text={error} /> : null}
      {loading && !beaches.length ? <Loading /> : null}
      {beaches.map((b) =>
        editing === b.id ? (
          <React.Fragment key={b.id}>{formCard}</React.Fragment>
        ) : (
          <Card key={b.id}>
            <Text style={st.title}>{b.name}</Text>
            {b.description ? <Text style={st.desc}>{b.description}</Text> : null}
            <Text style={st.meta}>
              {b.total_sunbeds} ξαπλώστρες · {b.ltd.toFixed(5)}, {b.lgd.toFixed(5)}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Button title="Επεξεργασία" icon="create-outline" small variant="secondary" onPress={() => start(b)} />
              <Button title="Διαγραφή" icon="trash-outline" small variant="danger" onPress={() => remove(b)} />
            </View>
          </Card>
        ),
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 4 },
  desc: { fontSize: 14, color: C.textMuted },
  meta: { fontSize: 13, color: C.textFaint, marginTop: 6 },
});
