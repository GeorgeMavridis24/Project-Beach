import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Chip } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { euro, longDate } from '@/lib/dates';
import type { Booking, Proposal } from '@/lib/types';

type Msg = {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  proposals?: (Proposal & { state?: 'booking' | 'booked' | 'failed'; note?: string })[];
  local?: boolean; // δεν στέλνεται στο API (π.χ. καλωσόρισμα)
};

const SUGGESTIONS = [
  'Ποια παραλία έχει ελεύθερες VIP την πρώτη μέρα της σεζόν;',
  'Θέλω φθηνή ξαπλώστρα για απόγευμα',
  'Ποιες είναι οι κρατήσεις μου;',
  'Πόσο κοστίζει μισή μέρα;',
];

let counter = 0;
const nextId = () => `${Date.now()}-${counter++}`;

export default function AssistantScreen() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 'hello',
      role: 'assistant',
      local: true,
      text: `Γεια σου ${user?.username ?? ''}! Είμαι ο βοηθός του SmartBeach. Μπορώ να σου βρω ελεύθερες ξαπλώστρες, να συγκρίνω τιμές και να σου ετοιμάσω κράτηση. Τι ψάχνεις;`,
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    const userMsg: Msg = { id: nextId(), role: 'user', text: content };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      // Στέλνουμε μόνο το κείμενο της συζήτησης (τελευταία 20 μηνύματα).
      const history = next
        .filter((m) => !m.local && (m.role === 'user' || m.role === 'assistant'))
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.text }));
      const res = await api<{ reply: string; proposals: Proposal[] }>('/assistant/chat', {
        method: 'POST',
        body: { messages: history },
      });
      setMessages((cur) => [...cur, { id: nextId(), role: 'assistant', text: res.reply, proposals: res.proposals }]);
    } catch (e: any) {
      setMessages((cur) => [...cur, { id: nextId(), role: 'error', text: e.message, local: true }]);
    } finally {
      setSending(false);
    }
  };

  const updateProposal = (msgId: string, index: number, patch: Partial<NonNullable<Msg['proposals']>[number]>) => {
    setMessages((cur) =>
      cur.map((m) =>
        m.id === msgId && m.proposals
          ? { ...m, proposals: m.proposals.map((p, i) => (i === index ? { ...p, ...patch } : p)) }
          : m,
      ),
    );
  };

  // Human-in-the-loop: η κράτηση γίνεται ΜΟΝΟ όταν πατήσει ο χρήστης.
  const confirmProposal = async (msgId: string, index: number, p: Proposal) => {
    updateProposal(msgId, index, { state: 'booking' });
    try {
      const b = await api<Booking>('/bookings', {
        method: 'POST',
        body: { sunbed_id: p.sunbed_id, res_date: p.res_date, start_time: p.start_time, end_time: p.end_time },
      });
      updateProposal(msgId, index, { state: 'booked', note: `Κωδικός εισόδου: ${b.checkin_code}` });
    } catch (e: any) {
      updateProposal(msgId, index, { state: 'failed', note: e.message });
    }
  };

  const renderItem = ({ item }: { item: Msg }) => {
    const mine = item.role === 'user';
    return (
      <View style={[st.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
        {!mine ? (
          <View style={[st.avatar, item.role === 'error' && { backgroundColor: C.dangerSoft }]}>
            <Ionicons name={item.role === 'error' ? 'alert' : 'sunny'} size={16} color={item.role === 'error' ? C.danger : C.primary} />
          </View>
        ) : null}
        <View style={{ maxWidth: '82%', gap: 8 }}>
          <View style={[st.bubble, mine ? st.mine : item.role === 'error' ? st.err : st.theirs]}>
            <Text style={[st.text, mine && { color: '#FFFFFF' }, item.role === 'error' && { color: C.danger }]}>{item.text}</Text>
          </View>
          {item.proposals?.map((p, i) => (
            <View key={`${p.sunbed_id}-${p.start_time}`} style={st.proposal}>
              <Text style={st.propTitle}>{p.beach_name}</Text>
              <Text style={st.propLine}>
                {longDate(p.res_date)} · {p.start_time}-{p.end_time}
              </Text>
              <Text style={st.propLine}>
                Σειρά {p.grid_x}, θέση {p.grid_y} · {p.type === 'premium' ? 'VIP ★' : 'Κανονική'}
              </Text>
              <Text style={st.propPrice}>{euro(p.price)}</Text>
              {p.state === 'booked' ? (
                <Text style={[st.propNote, { color: C.success }]}>✓ Η κράτηση έγινε! {p.note}</Text>
              ) : (
                <>
                  {p.state === 'failed' ? <Text style={[st.propNote, { color: C.danger }]}>{p.note}</Text> : null}
                  <Button
                    title="Επιβεβαίωση κράτησης"
                    icon="checkmark-circle-outline"
                    small
                    loading={p.state === 'booking'}
                    onPress={() => confirmProposal(item.id, i, p)}
                    style={{ marginTop: 8 }}
                  />
                </>
              )}
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={st.screen} edges={['top']}>
      <View style={st.header}>
        <Text style={st.title}>Βοηθός</Text>
        <Text style={st.subtitle}>Ρώτα με για παραλίες, τιμές και κρατήσεις</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={
            <>
              {sending ? (
                <View style={st.typing}>
                  <ActivityIndicator size="small" color={C.primary} />
                  <Text style={st.typingText}>Ο βοηθός ψάχνει…</Text>
                </View>
              ) : null}
              {messages.length === 1 ? (
                <View style={st.suggestions}>
                  {SUGGESTIONS.map((sug) => (
                    <Chip key={sug} label={sug} onPress={() => send(sug)} />
                  ))}
                </View>
              ) : null}
            </>
          }
        />
        <View style={st.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Γράψε ένα μήνυμα…"
            placeholderTextColor={C.textFaint}
            style={st.input}
            multiline
            maxLength={1000}
            onSubmitEditing={() => send(input)}
            blurOnSubmit
            accessibilityLabel="Μήνυμα προς τον βοηθό"
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!input.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Αποστολή"
            style={[st.send, (!input.trim() || sending) && { opacity: 0.4 }]}
          >
            <Ionicons name="send" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 14, color: C.textMuted, marginTop: 2 },
  list: { padding: 16, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  bubbleRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  mine: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: C.card, borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  err: { backgroundColor: C.dangerSoft },
  text: { fontSize: 15, lineHeight: 21, color: C.text },
  proposal: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: C.primary },
  propTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  propLine: { fontSize: 14, color: C.textMuted, marginTop: 2 },
  propPrice: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 6 },
  propNote: { fontSize: 13, marginTop: 6, fontWeight: '600' },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 38 },
  typingText: { color: C.textMuted, fontSize: 14 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, paddingLeft: 38 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    backgroundColor: C.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    backgroundColor: C.bg,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    color: C.text,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
});
