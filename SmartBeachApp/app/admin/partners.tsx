import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Banner, Chip, ChipRow, Empty, Loading, Screen } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { shortDate } from '@/lib/dates';
import type { PartnerRequest } from '@/lib/types';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';
const STATUS = {
  pending: { text: 'Σε εξέταση', tone: 'warning' as const },
  approved: { text: 'Εγκρίθηκε', tone: 'success' as const },
  rejected: { text: 'Απορρίφθηκε', tone: 'danger' as const },
};

export default function AdminPartnersScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('pending');
  const [items, setItems] = useState<PartnerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<PartnerRequest[]>('/admin/partner-requests', { query: { status: filter === 'all' ? undefined : filter } }));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen topInset={false} onRefresh={load}>
      <ChipRow>
        <Chip label="Σε εξέταση" selected={filter === 'pending'} onPress={() => setFilter('pending')} />
        <Chip label="Εγκεκριμένες" selected={filter === 'approved'} onPress={() => setFilter('approved')} />
        <Chip label="Απορριφθείσες" selected={filter === 'rejected'} onPress={() => setFilter('rejected')} />
        <Chip label="Όλες" selected={filter === 'all'} onPress={() => setFilter('all')} />
      </ChipRow>
      {error ? <Banner text={error} /> : null}
      {loading && !items.length ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text="Δεν υπάρχουν αιτήσεις εδώ." icon="briefcase-outline" />
      ) : (
        items.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => router.push({ pathname: '/admin/request', params: { id: String(r.id) } })}
            accessibilityRole="button"
            style={({ pressed }) => [st.item, pressed && { opacity: 0.85 }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <View style={st.head}>
                <Text style={st.title}>{r.business_name}</Text>
                <Badge text={STATUS[r.status].text} tone={STATUS[r.status].tone} />
              </View>
              <Text style={st.text}>
                {r.username} · {r.email}
              </Text>
              <Text style={st.text}>
                {r.total_sunbeds} ξαπλώστρες · {r.open_time}–{r.close_time} · {shortDate(r.created_at.slice(0, 10))}
              </Text>
              <View style={st.meta}>
                <Ionicons name="chatbubbles-outline" size={14} color={C.textMuted} />
                <Text style={st.text}>{r.message_count ?? 0} μηνύματα</Text>
                {r.unread_admin ? <Badge text={`${r.unread_admin} νέα`} tone="primary" /> : null}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.textFaint} />
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: C.text, flex: 1 },
  text: { fontSize: 13, color: C.textMuted },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
});
