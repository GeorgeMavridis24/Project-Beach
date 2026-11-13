import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Badge, Banner, Button, Card, Chip, ChipRow, Empty, Field, Label, Loading, Screen } from '@/components/ui';
import { C } from '@/constants/brand';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { euro } from '@/lib/dates';
import { confirm } from '@/lib/dialogs';
import { ROLE_LABEL } from '@/lib/roles';
import type { AdminUser, Role } from '@/lib/types';


export default function AdminUsersScreen() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // νέος χρήστης
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'user' as Role });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api<AdminUser[]>('/admin/users', { query: { q: debouncedQ, role } }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, role]);

  useEffect(() => {
    load();
  }, [load]);

  const changeRole = async (u: AdminUser, newRole: Role) => {
    if (newRole === u.role) return;
    setError(null);
    try {
      await api(`/admin/users/${u.id}`, { method: 'PUT', body: { role: newRole } });
      setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, role: newRole } : x)));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const createUser = async () => {
    setError(null);
    if (form.username.trim().length < 2 || !form.email.includes('@') || form.password.length < 6) {
      setError('Συμπλήρωσε όνομα, σωστό email και κωδικό τουλάχιστον 6 χαρακτήρων.');
      return;
    }
    setSaving(true);
    try {
      const u = await api<AdminUser>('/admin/users', { method: 'POST', body: { ...form, email: form.email.trim() } });
      setMessage(`Δημιουργήθηκε ο λογαριασμός ${u.email} (${ROLE_LABEL[u.role]}). Μπορεί να συνδεθεί αμέσως.`);
      setForm({ username: '', email: '', password: '', role: 'user' });
      setAdding(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (u: AdminUser) => {
    setError(null);
    setMessage(null);
    const ok = await confirm(
      'Διαγραφή χρήστη',
      `Θα διαγραφεί ο λογαριασμός «${u.username}» (${u.email}). Οι παλιές του κρατήσεις μένουν ανώνυμα για τα στατιστικά.`,
      'Διαγραφή',
      true,
    );
    if (!ok) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'DELETE' });
      setMessage(`Ο χρήστης «${u.username}» διαγράφηκε.`);
      load();
    } catch (e: any) {
      // Έχει μελλοντικές κρατήσεις: ρωτάμε ξανά αν θέλουμε να ακυρωθούν
      if (e instanceof ApiError && e.status === 409 && e.message.includes('μελλοντικές')) {
        if (!(await confirm('Μελλοντικές κρατήσεις', e.message, 'Ακύρωση κρατήσεων & διαγραφή', true))) return;
        try {
          const r = await api<{ cancelled_bookings: number }>(`/admin/users/${u.id}`, { method: 'DELETE', query: { cancel_future: true } });
          setMessage(`Ο χρήστης «${u.username}» διαγράφηκε και ακυρώθηκαν ${r.cancelled_bookings} κρατήσεις.`);
          load();
        } catch (e2: any) {
          setError(e2.message);
        }
      } else {
        setError(e.message);
      }
    }
  };

  return (
    <Screen topInset={false} onRefresh={load}>
      {message ? <Banner text={message} tone="success" /> : null}
      {adding ? (
        <Card style={{ borderColor: C.primary, borderWidth: 1.5 }}>
          <Text style={st.formTitle}>Νέος χρήστης</Text>
          <Field label="Όνομα" value={form.username} onChangeText={(v) => setForm({ ...form, username: v })} />
          <Field
            label="Email"
            value={form.email}
            onChangeText={(v) => setForm({ ...form, email: v })}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Κωδικός (τουλάχιστον 6 χαρακτήρες)"
            value={form.password}
            onChangeText={(v) => setForm({ ...form, password: v })}
            secureTextEntry
            autoComplete="new-password"
          />
          <Label>Ρόλος</Label>
          <ChipRow wrap>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <Chip key={r} label={ROLE_LABEL[r]} selected={form.role === r} onPress={() => setForm({ ...form, role: r })} />
            ))}
          </ChipRow>
          <Text style={st.meta}>Ο λογαριασμός ενεργοποιείται αμέσως, χωρίς κωδικό από το email.</Text>
          <View style={st.formActions}>
            <Button title="Δημιουργία" icon="person-add-outline" onPress={createUser} loading={saving} style={{ flex: 1 }} />
            <Button title="Άκυρο" variant="secondary" onPress={() => setAdding(false)} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : (
        <Button
          title="Νέος χρήστης"
          icon="person-add-outline"
          onPress={() => {
            setAdding(true);
            setMessage(null);
          }}
          style={{ marginBottom: 12 }}
        />
      )}
      <View style={st.search}>
        <Ionicons name="search" size={18} color={C.textFaint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Όνομα ή email"
          placeholderTextColor={C.textFaint}
          style={st.searchInput}
          autoCapitalize="none"
        />
      </View>
      <ChipRow>
        <Chip label="Όλοι" selected={role === null} onPress={() => setRole(null)} />
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <Chip key={r} label={ROLE_LABEL[r]} selected={role === r} onPress={() => setRole(r)} />
        ))}
      </ChipRow>
      {error ? <Banner text={error} /> : null}
      <Text style={st.count}>{users.length} χρήστες</Text>
      {loading && !users.length ? (
        <Loading />
      ) : users.length === 0 ? (
        <Empty text="Δεν βρέθηκαν χρήστες." icon="people-outline" />
      ) : (
        users.map((u) => (
          <Card key={u.id}>
            <View style={st.head}>
              <Text style={st.name}>{u.username}</Text>
              <Badge
                text={ROLE_LABEL[u.role]}
                tone={u.role === 'admin' ? 'danger' : u.role === 'owner' ? 'primary' : u.role === 'staff' ? 'warning' : 'neutral'}
              />
            </View>
            <Text style={st.meta}>{u.email}</Text>
            <Text style={st.meta}>
              {u.bookings} κρατήσεις · {euro(u.spent)}
            </Text>
            {u.role === 'owner' ? (
              <Text style={st.meta}>Κατάστημα: {u.owns ?? 'δεν έχει ανατεθεί (ορίζεται από τα Καταστήματα)'}</Text>
            ) : null}
            {u.id !== me?.id ? (
              <View style={{ marginTop: 10 }}>
                <Text style={st.roleLabel}>Ρόλος</Text>
                <ChipRow wrap>
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <Chip key={r} label={ROLE_LABEL[r]} selected={u.role === r} onPress={() => changeRole(u, r)} />
                  ))}
                </ChipRow>
                <Button
                  title="Διαγραφή χρήστη"
                  icon="trash-outline"
                  small
                  variant="danger"
                  onPress={() => deleteUser(u)}
                  style={{ alignSelf: 'flex-start', marginTop: 8 }}
                />
              </View>
            ) : (
              <Text style={[st.meta, { marginTop: 8 }]}>Αυτός είσαι εσύ.</Text>
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
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
  count: { fontSize: 13, color: C.textMuted, marginVertical: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 17, fontWeight: '700', color: C.text, flex: 1 },
  meta: { fontSize: 14, color: C.textMuted, marginTop: 2 },
  formTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 6 },
  roleLabel: { fontSize: 12, fontWeight: '600', color: C.textMuted, marginBottom: 2 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
