import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BeachMap } from '@/components/BeachMap';
import { TimeField } from '@/components/pickers';
import { MapLegend, previewCells, SunbedMap } from '@/components/SunbedMap';
import { Banner, Button, Card, Field, Label, Loading, Screen } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { euro, toMinutes } from '@/lib/dates';
import type { PartnerRequest } from '@/lib/types';

const STEPS = ['Επιχείρηση', 'Τοποθεσία', 'Ωράριο', 'Ξαπλώστρες', 'Υποβολή'];

type Form = {
  business_name: string;
  description: string;
  phone: string;
  ltd: number | null;
  lgd: number | null;
  open_time: string;
  close_time: string;
  rows: number;
  cols: number;
  premium_rows: number;
  premium_price: string;
  price: string;
  message: string;
};

const START: Form = {
  business_name: '',
  description: '',
  phone: '',
  ltd: null,
  lgd: null,
  open_time: '09:00',
  close_time: '20:00',
  rows: 4,
  cols: 8,
  premium_rows: 1,
  premium_price: '20',
  price: '10',
  message: '',
};

function NumberStepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <View style={st.stepper}>
      <Text style={st.stepLabel}>{label}</Text>
      <View style={st.stepRow}>
        <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={st.stepBtn} accessibilityLabel={`${label} λιγότερες`}>
          <Ionicons name="remove" size={20} color={C.primary} />
        </Pressable>
        <Text style={st.stepValue}>{value}</Text>
        <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={st.stepBtn} accessibilityLabel={`${label} περισσότερες`}>
          <Ionicons name="add" size={20} color={C.primary} />
        </Pressable>
      </View>
    </View>
  );
}

export default function PartnerApplyScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(START);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Αν υπάρχει αίτηση σε εξέλιξη, τη διορθώνουμε αντί να φτιάξουμε νέα.
  useEffect(() => {
    api<PartnerRequest[]>('/partner/requests/me')
      .then((list) => {
        const pending = list.find((r) => r.status === 'pending');
        if (pending) {
          setEditingId(pending.id);
          setForm({
            business_name: pending.business_name,
            description: pending.description,
            phone: pending.phone,
            ltd: pending.ltd,
            lgd: pending.lgd,
            open_time: pending.open_time,
            close_time: pending.close_time,
            rows: pending.rows,
            cols: pending.cols,
            premium_rows: pending.premium_rows,
            premium_price: String(pending.premium_price),
            price: String(pending.price),
            message: '',
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const num = (s: string) => Number(s.replace(',', '.'));

  const stepError = (i: number): string | null => {
    if (i === 0) {
      if (form.business_name.trim().length < 2) return 'Γράψε το όνομα του καταστήματος.';
      if (!/^[0-9 +()-]{7,20}$/.test(form.phone.trim())) return 'Γράψε ένα έγκυρο τηλέφωνο επικοινωνίας.';
    }
    if (i === 1 && (form.ltd === null || form.lgd === null)) return 'Πάτα πάνω στον χάρτη για να ορίσεις πού βρίσκεσαι.';
    if (i === 2 && toMinutes(form.close_time) <= toMinutes(form.open_time)) return 'Η ώρα κλεισίματος πρέπει να είναι μετά το άνοιγμα.';
    if (i === 3) {
      if (!(num(form.price) > 0) || !(num(form.premium_price) > 0)) return 'Βάλε τιμές μεγαλύτερες από 0.';
    }
    return null;
  };

  const next = () => {
    const err = stepError(step);
    setError(err);
    if (!err) setStep(step + 1);
  };

  const useMyLocation = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return setError('Δεν δόθηκε άδεια τοποθεσίας. Πάτα πάνω στον χάρτη.');
      const pos = await Location.getCurrentPositionAsync({});
      set({ ltd: pos.coords.latitude, lgd: pos.coords.longitude });
      setError(null);
    } catch {
      setError('Δεν βρέθηκε η τοποθεσία. Πάτα πάνω στον χάρτη.');
    }
  };

  const submit = async () => {
    for (let i = 0; i < 4; i++) {
      const err = stepError(i);
      if (err) {
        setStep(i);
        setError(err);
        return;
      }
    }
    setBusy(true);
    setError(null);
    const body = {
      business_name: form.business_name.trim(),
      description: form.description.trim(),
      phone: form.phone.trim(),
      ltd: form.ltd,
      lgd: form.lgd,
      open_time: form.open_time,
      close_time: form.close_time,
      rows: form.rows,
      cols: form.cols,
      premium_rows: form.premium_rows,
      premium_price: num(form.premium_price),
      price: num(form.price),
      message: form.message.trim() || undefined,
    };
    try {
      if (editingId) {
        await api(`/partner/requests/${editingId}`, { method: 'PUT', body });
        if (body.message) await api(`/partner/requests/${editingId}/messages`, { method: 'POST', body: { body: body.message } });
      } else {
        await api('/partner/requests', { method: 'POST', body });
      }
      router.replace('/partner/status');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading />;

  const total = form.rows * form.cols;
  const vip = form.premium_rows * form.cols;
  const maxRevenue = vip * (num(form.premium_price) || 0) + (total - vip) * (num(form.price) || 0);
  const picked = form.ltd !== null && form.lgd !== null ? { lat: form.ltd, lng: form.lgd } : null;

  return (
    <Screen topInset={false}>
      {/* Πρόοδος */}
      <View style={st.progress}>
        {STEPS.map((label, i) => (
          <Pressable
            key={label}
            onPress={() => (i < step ? setStep(i) : undefined)}
            style={st.progressItem}
            accessibilityLabel={`Βήμα ${i + 1}: ${label}`}
          >
            <View style={[st.dot, i <= step && st.dotOn]}>
              {i < step ? <Ionicons name="checkmark" size={14} color="#FFF" /> : <Text style={[st.dotText, i === step && { color: '#FFF' }]}>{i + 1}</Text>}
            </View>
            <Text style={[st.progressLabel, i === step && { color: C.text, fontWeight: '700' }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {editingId ? <Banner text="Διορθώνεις την αίτηση που έχεις ήδη στείλει." tone="info" /> : null}

      <Card>
        {step === 0 ? (
          <>
            <Text style={st.h}>Πες μας για την επιχείρησή σου</Text>
            <Field label="Όνομα καταστήματος" value={form.business_name} onChangeText={(v) => set({ business_name: v })} placeholder="π.χ. Kymata Beach Bar" />
            <Field
              label="Περιγραφή"
              value={form.description}
              onChangeText={(v) => set({ description: v })}
              placeholder="Τι κάνει τον χώρο σου ξεχωριστό;"
              multiline
            />
            <Field label="Τηλέφωνο επικοινωνίας" value={form.phone} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" placeholder="69xxxxxxxx" />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={st.h}>Πού βρίσκεται;</Text>
            <Text style={st.help}>Πάτα πάνω στον χάρτη στο σημείο του καταστήματος.</Text>
            <BeachMap pins={[]} picked={picked} onPick={(lat, lng) => set({ ltd: lat, lgd: lng })} height={320} />
            <Button title="Η τρέχουσα τοποθεσία μου" icon="locate-outline" variant="ghost" small onPress={useMyLocation} />
            {picked ? (
              <Text style={st.help}>
                Επιλεγμένο σημείο: {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
              </Text>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={st.h}>Ωράριο λειτουργίας</Text>
            <Text style={st.help}>Οι πελάτες θα κλείνουν ξαπλώστρα μόνο μέσα σε αυτές τις ώρες. Αλλάζει όποτε θες.</Text>
            <View style={st.row}>
              <TimeField label="Ανοίγει" value={form.open_time} min={0} max={toMinutes(form.close_time) - 60} onChange={(v) => set({ open_time: v })} />
              <TimeField label="Κλείνει" value={form.close_time} min={toMinutes(form.open_time) + 60} max={23 * 60 + 59} onChange={(v) => set({ close_time: v })} />
            </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={st.h}>Διαμόρφωσε τον χώρο σου</Text>
            <Text style={st.help}>Η σειρά 1 είναι η πιο κοντινή στη θάλασσα. Οι πρώτες σειρές μπορούν να είναι VIP.</Text>
            <View style={st.row}>
              <NumberStepper label="Σειρές" value={form.rows} min={1} max={30} onChange={(v) => set({ rows: v, premium_rows: Math.min(form.premium_rows, v) })} />
              <NumberStepper label="Θέσεις/σειρά" value={form.cols} min={1} max={30} onChange={(v) => set({ cols: v })} />
            </View>
            <View style={[st.row, { marginTop: 10 }]}>
              <NumberStepper label="VIP σειρές" value={form.premium_rows} min={0} max={form.rows} onChange={(v) => set({ premium_rows: v })} />
            </View>
            <View style={[st.row, { marginTop: 10 }]}>
              <Field label="Τιμή VIP / ημέρα (€)" value={form.premium_price} onChangeText={(v) => set({ premium_price: v })} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
              <Field label="Τιμή κανονικής (€)" value={form.price} onChangeText={(v) => set({ price: v })} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
            </View>
            <Label>Προεπισκόπηση</Label>
            <MapLegend mode="admin" />
            <SunbedMap mode="admin" rows={form.rows} cols={form.cols} cells={previewCells(form.rows, form.cols, form.premium_rows)} />
            <Text style={st.summary}>
              {total} ξαπλώστρες ({vip} VIP) · μέγιστα έσοδα ημέρας με πληρότητα 100%: {euro(maxRevenue)}
            </Text>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Text style={st.h}>Έλεγξε και στείλε</Text>
            <Summary icon="storefront-outline" text={`${form.business_name} · ${form.phone}`} />
            {form.description ? <Summary icon="document-text-outline" text={form.description} /> : null}
            <Summary icon="location-outline" text={picked ? `${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}` : '-'} />
            <Summary icon="time-outline" text={`Ωράριο ${form.open_time} – ${form.close_time}`} />
            <Summary
              icon="grid-outline"
              text={`${form.rows} σειρές × ${form.cols} θέσεις = ${total} ξαπλώστρες · ${form.premium_rows} VIP σειρές (${euro(num(form.premium_price))}) · κανονική ${euro(num(form.price))}`}
            />
            <Field
              label="Μήνυμα προς την ομάδα (προαιρετικό)"
              value={form.message}
              onChangeText={(v) => set({ message: v })}
              placeholder="Κάτι που θέλεις να μας πεις;"
              multiline
            />
            <Text style={st.help}>
              Η αίτηση θα εξεταστεί από την ομάδα του SmartBeach. Μπορείτε να επικοινωνείτε με μηνύματα μέσα στην εφαρμογή και
              θα ειδοποιηθείς με email μόλις εγκριθεί.
            </Text>
          </>
        ) : null}
      </Card>

      {error ? <Banner text={error} /> : null}

      <View style={st.nav}>
        {step > 0 ? <Button title="Πίσω" icon="arrow-back" variant="secondary" onPress={() => { setError(null); setStep(step - 1); }} style={{ flex: 1 }} /> : null}
        {step < STEPS.length - 1 ? (
          <Button title="Επόμενο" icon="arrow-forward" onPress={next} style={{ flex: 1 }} />
        ) : (
          <Button title={editingId ? 'Αποθήκευση αλλαγών' : 'Υποβολή αίτησης'} icon="paper-plane-outline" onPress={submit} loading={busy} style={{ flex: 1 }} />
        )}
      </View>
    </Screen>
  );
}

function Summary({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={st.sumRow}>
      <Ionicons name={icon} size={18} color={C.primary} />
      <Text style={st.sumText}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  progress: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  progressItem: { alignItems: 'center', flex: 1, gap: 4 },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E4E2DA', alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: C.primary },
  dotText: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  progressLabel: { fontSize: 11, color: C.textMuted },
  h: { fontSize: 19, fontWeight: '700', color: C.text, marginBottom: 6 },
  help: { fontSize: 14, color: C.textMuted, marginBottom: 8, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10 },
  stepper: { flex: 1, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 10 },
  stepLabel: { fontSize: 12, color: C.textMuted, fontWeight: '600', textAlign: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 20, fontWeight: '700', color: C.text },
  summary: { fontSize: 14, color: C.text, fontWeight: '600', marginTop: 4 },
  sumRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  sumText: { flex: 1, fontSize: 15, color: C.text },
  nav: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
