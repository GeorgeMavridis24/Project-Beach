import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BeachMap } from '@/components/BeachMap';
import { openDirections } from '@/components/beachMapShared';
import { MessageThread } from '@/components/MessageThread';
import { MapLegend, previewCells, SunbedMap } from '@/components/SunbedMap';
import { Badge, Banner, Button, Card, Field, Loading, Screen, SectionTitle } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { euro, shortDate } from '@/lib/dates';
import { confirm } from '@/lib/dialogs';
import type { PartnerRequest } from '@/lib/types';

const STATUS = {
  pending: { text: 'Σε εξέταση', tone: 'warning' as const },
  approved: { text: 'Εγκρίθηκε', tone: 'success' as const },
  rejected: { text: 'Απορρίφθηκε', tone: 'danger' as const },
};

export default function AdminRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [req, setReq] = useState<PartnerRequest | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReq(await api<PartnerRequest>(`/admin/partner-requests/${id}`));
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 15000);
      return () => clearInterval(t);
    }, [load]),
  );

  const decide = async (action: 'approve' | 'reject') => {
    if (!req) return;
    if (action === 'reject' && !note.trim()) {
      setError('Γράψε στο σχόλιο τον λόγο της απόρριψης, για να τον δει ο αιτών.');
      return;
    }
    const question =
      action === 'approve'
        ? `Θα δημιουργηθεί το «${req.business_name}» με ${req.total_sunbeds} ξαπλώστρες και ο ${req.username} θα γίνει καταστηματάρχης.`
        : `Η αίτηση του ${req.username} θα απορριφθεί.`;
    if (!(await confirm(action === 'approve' ? 'Έγκριση αίτησης' : 'Απόρριψη αίτησης', question, action === 'approve' ? 'Έγκριση' : 'Απόρριψη', action === 'reject'))) {
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const updated = await api<PartnerRequest>(`/admin/partner-requests/${req.id}/${action}`, {
        method: 'POST',
        body: { note: note.trim() || undefined },
      });
      setReq(updated);
      setNote('');
      setDone(action === 'approve' ? 'Εγκρίθηκε! Το κατάστημα δημιουργήθηκε και ο αιτών ενημερώθηκε με email.' : 'Η αίτηση απορρίφθηκε και ο αιτών ενημερώθηκε.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (!req) return error ? <Banner text={error} /> : <Loading />;

  return (
    <Screen topInset={false} onRefresh={load}>
      {done ? <Banner text={done} tone="success" /> : null}
      {error ? <Banner text={error} /> : null}
      <Card>
        <View style={st.head}>
          <Text style={st.title}>{req.business_name}</Text>
          <Badge text={STATUS[req.status].text} tone={STATUS[req.status].tone} />
        </View>
        {req.description ? <Text style={st.desc}>{req.description}</Text> : null}
        <Text style={st.line}>Αιτών: {req.username} · {req.email} · τηλ. {req.phone}</Text>
        <Text style={st.line}>Υποβλήθηκε: {shortDate(req.created_at.slice(0, 10))}</Text>
        <Text style={st.line}>Ωράριο: {req.open_time} – {req.close_time}</Text>
      </Card>

      <SectionTitle right={<Button title="Οδηγίες" icon="navigate-outline" small variant="ghost" onPress={() => openDirections(req.ltd, req.lgd)} />}>
        Τοποθεσία
      </SectionTitle>
      <BeachMap pins={[{ id: req.id, lat: req.ltd, lng: req.lgd, title: req.business_name, tone: 'none' }]} height={220} />

      <SectionTitle>Διάταξη χώρου</SectionTitle>
      <Card>
        <Text style={st.line}>
          {req.rows} σειρές × {req.cols} θέσεις = {req.total_sunbeds} ξαπλώστρες · {req.premium_rows} VIP σειρές
        </Text>
        <Text style={st.line}>Τιμή VIP {euro(req.premium_price)} · κανονική {euro(req.price)} / ημέρα</Text>
        <MapLegend mode="admin" />
        <SunbedMap mode="admin" rows={req.rows} cols={req.cols} cells={previewCells(req.rows, req.cols, req.premium_rows)} />
      </Card>

      {req.status === 'pending' ? (
        <>
          <SectionTitle>Απόφαση</SectionTitle>
          <Card>
            <Field
              label="Σχόλιο προς τον αιτούντα (υποχρεωτικό στην απόρριψη)"
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="π.χ. Καλώς ήρθατε! / Χρειαζόμαστε άδεια λειτουργίας."
            />
            <View style={st.actions}>
              <Button title="Έγκριση" icon="checkmark-circle-outline" onPress={() => decide('approve')} loading={busy === 'approve'} style={{ flex: 1 }} />
              <Button title="Απόρριψη" icon="close-circle-outline" variant="danger" onPress={() => decide('reject')} loading={busy === 'reject'} style={{ flex: 1 }} />
            </View>
          </Card>
        </>
      ) : req.admin_note ? (
        <Banner text={`Σχόλιο: ${req.admin_note}`} tone="info" />
      ) : null}

      <SectionTitle>Επικοινωνία με τον αιτούντα</SectionTitle>
      <Card>
        <MessageThread
          messages={req.messages ?? []}
          myId={user?.id ?? -1}
          placeholder={`Γράψε στον/στην ${req.username}…`}
          onSend={async (body) => {
            const updated = await api<PartnerRequest>(`/partner/requests/${req.id}/messages`, { method: 'POST', body: { body } });
            setReq(updated);
          }}
        />
      </Card>
    </Screen>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 19, fontWeight: '700', color: C.text, flex: 1 },
  desc: { fontSize: 14, color: C.text, marginBottom: 6 },
  line: { fontSize: 14, color: C.textMuted, marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 10 },
});
