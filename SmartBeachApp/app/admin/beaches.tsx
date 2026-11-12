import * as Location from 'expo-location';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BeachMap } from '@/components/BeachMap';
import { TimeField } from '@/components/pickers';
import { Badge, Banner, Button, Card, Chip, ChipRow, Empty, Field, Label, Loading, Screen } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toMinutes } from '@/lib/dates';
import { confirm } from '@/lib/dialogs';
import { managedBeaches } from '@/lib/roles';
import type { AdminUser, Beach } from '@/lib/types';

type Form = {
  name: string;
  description: string;
  ltd: string;
  lgd: string;
  open_time: string;
  close_time: string;
  owner_id: number | null;
};

export default function AdminBeachesScreen() {
  const { user, config } = useAuth();
  const isAdmin = user?.role === 'admin';
  const empty: Form = {
    name: '',
    description: '',
    ltd: '',
    lgd: '',
    open_time: config?.default_open_time ?? '08:00',
    close_time: config?.default_close_time ?? '20:00',
    owner_id: null,
  };

  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [owners, setOwners] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await api<Beach[]>('/beaches');
      const mine = managedBeaches(user, all);
      setBeaches(mine);
      // Ο καταστηματάρχης με ένα κατάστημα βλέπει κατευθείαν τη φόρμα του
      if (user?.role === 'owner' && mine.length === 1) start(mine[0]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    load();
    if (isAdmin) api<AdminUser[]>('/admin/users', { query: { role: 'owner' } }).then(setOwners).catch(() => {});
  }, [load, isAdmin]);

  function start(b?: Beach) {
    setError(null);
    setMessage(null);
    setEditing(b ? b.id : 'new');
    setForm(
      b
        ? {
            name: b.name,
            description: b.description,
            ltd: String(b.ltd),
            lgd: String(b.lgd),
            open_time: b.open_time,
            close_time: b.close_time,
            owner_id: b.owner_id,
          }
        : empty,
    );
  }

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
    setError(null);
    if (toMinutes(form.close_time) <= toMinutes(form.open_time)) {
      setError('Η ώρα κλεισίματος πρέπει να είναι μετά την ώρα ανοίγματος.');
      return;
    }
    const ltd = Number(form.ltd.replace(',', '.'));
    const lgd = Number(form.lgd.replace(',', '.'));
    if (!form.ltd || !form.lgd || Number.isNaN(ltd) || Number.isNaN(lgd)) {
      setError('Διάλεξε τη θέση του καταστήματος πατώντας πάνω στον χάρτη.');
      return;
    }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      ltd,
      lgd,
      open_time: form.open_time,
      close_time: form.close_time,
      owner_id: form.owner_id,
    };
    try {
      if (editing === 'new') await api('/admin/beaches', { method: 'POST', body });
      else await api(`/admin/beaches/${editing}`, { method: 'PUT', body });
      setMessage(`Αποθηκεύτηκε. Ωράριο: ${form.open_time} – ${form.close_time}.`);
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b: Beach) => {
    const ok = await confirm('Διαγραφή καταστήματος', `Θα διαγραφεί το «${b.name}» μαζί με τις ξαπλώστρες και τις κρατήσεις του.`, 'Διαγραφή', true);
    if (!ok) return;
    try {
      await api(`/admin/beaches/${b.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const picked =
    form.ltd && form.lgd && !Number.isNaN(Number(form.ltd)) && !Number.isNaN(Number(form.lgd))
      ? { lat: Number(form.ltd), lng: Number(form.lgd) }
      : null;

  const formCard = (
    <Card style={{ borderColor: C.primary, borderWidth: 1.5 }}>
      <Text style={st.title}>{editing === 'new' ? 'Νέο κατάστημα' : form.name || 'Επεξεργασία'}</Text>
      {error ? <Banner text={error} /> : null}

      <Label>Ωράριο λειτουργίας</Label>
      <View style={st.row}>
        <TimeField
          label="Ανοίγει"
          value={form.open_time}
          min={0}
          max={toMinutes(form.close_time) - 60}
          onChange={(open_time) => setForm({ ...form, open_time })}
        />
        <TimeField
          label="Κλείνει"
          value={form.close_time}
          min={toMinutes(form.open_time) + 60}
          max={23 * 60 + 59}
          onChange={(close_time) => setForm({ ...form, close_time })}
        />
      </View>
      <Text style={st.help}>Οι πελάτες κλείνουν ξαπλώστρα μόνο μέσα σε αυτές τις ώρες.</Text>

      <Field label="Όνομα" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
      <Field
        label="Περιγραφή"
        value={form.description}
        onChangeText={(description) => setForm({ ...form, description })}
        multiline
      />

      <Label>Θέση στον χάρτη</Label>
      <Text style={st.help}>Πάτα πάνω στον χάρτη για να ορίσεις πού βρίσκεται το κατάστημα.</Text>
      <BeachMap
        key={String(editing)}
        pins={[]}
        picked={picked}
        onPick={(lat, lng) => setForm((f) => ({ ...f, ltd: lat.toFixed(6), lgd: lng.toFixed(6) }))}
        height={260}
      />
      <View style={st.row}>
        <Field label="Γεωγρ. πλάτος" value={form.ltd} onChangeText={(ltd) => setForm({ ...form, ltd })} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
        <Field label="Γεωγρ. μήκος" value={form.lgd} onChangeText={(lgd) => setForm({ ...form, lgd })} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
      </View>
      <Button title="Η τρέχουσα τοποθεσία μου" icon="locate-outline" variant="ghost" small onPress={useMyLocation} />

      {isAdmin ? (
        <>
          <Label>Καταστηματάρχης</Label>
          {owners.length ? (
            <ChipRow wrap>
              <Chip label="Κανένας" selected={!form.owner_id} onPress={() => setForm({ ...form, owner_id: null })} />
              {owners.map((o) => (
                <Chip key={o.id} label={o.username} selected={form.owner_id === o.id} onPress={() => setForm({ ...form, owner_id: o.id })} />
              ))}
            </ChipRow>
          ) : (
            <Text style={st.help}>Δεν υπάρχουν καταστηματάρχες. Δώσε σε έναν χρήστη ρόλο «Καταστηματάρχης» από τους Χρήστες.</Text>
          )}
        </>
      ) : null}

      <View style={[st.row, { marginTop: 12 }]}>
        <Button title="Αποθήκευση" onPress={save} loading={saving} style={{ flex: 1 }} />
        <Button title="Άκυρο" variant="secondary" onPress={() => setEditing(null)} style={{ flex: 1 }} />
      </View>
    </Card>
  );

  return (
    <Screen topInset={false} onRefresh={load}>
      {message ? <Banner text={message} tone="success" /> : null}
      {isAdmin && editing !== 'new' ? (
        <Button title="Νέο κατάστημα" icon="add" onPress={() => start()} style={{ marginBottom: 12 }} />
      ) : null}
      {editing === 'new' ? formCard : null}
      {error && editing === null ? <Banner text={error} /> : null}
      {loading && !beaches.length ? <Loading /> : null}
      {!loading && !beaches.length ? (
        <Empty text={isAdmin ? 'Δεν υπάρχουν καταστήματα.' : 'Δεν σου έχει ανατεθεί κατάστημα ακόμα. Επικοινώνησε με τον διαχειριστή.'} icon="storefront-outline" />
      ) : null}
      {beaches.map((b) =>
        editing === b.id ? (
          <React.Fragment key={b.id}>{formCard}</React.Fragment>
        ) : (
          <Card key={b.id}>
            <View style={st.head}>
              <Text style={[st.title, { flex: 1 }]}>{b.name}</Text>
              <Badge text={`${b.open_time} – ${b.close_time}`} tone="primary" icon="time-outline" />
            </View>
            {b.description ? <Text style={st.desc}>{b.description}</Text> : null}
            <Text style={st.meta}>
              {b.total_sunbeds} ξαπλώστρες
              {isAdmin ? ` · ${owners.find((o) => o.id === b.owner_id)?.username ?? 'χωρίς καταστηματάρχη'}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Button title="Επεξεργασία" icon="create-outline" small variant="secondary" onPress={() => start(b)} />
              {isAdmin ? <Button title="Διαγραφή" icon="trash-outline" small variant="danger" onPress={() => remove(b)} /> : null}
            </View>
          </Card>
        ),
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  desc: { fontSize: 14, color: C.textMuted },
  meta: { fontSize: 13, color: C.textFaint, marginTop: 6 },
  help: { fontSize: 13, color: C.textMuted, marginTop: 6, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 10 },
});
