import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Badge, Banner, Card, Chip, ChipRow, Empty, Loading, Screen, Segmented } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { euro } from '@/lib/dates';
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

  return (
    <Screen topInset={false} onRefresh={load}>
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
                <Segmented
                  options={(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                  value={u.role}
                  onChange={(r) => changeRole(u, r)}
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
});
