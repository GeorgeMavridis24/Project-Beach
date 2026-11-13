import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { C } from '@/constants/brand';
import type { PartnerMessage } from '@/lib/types';

function when(iso: string) {
  const d = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Συνομιλία αιτούντα - διαχειριστή. `myId`: ποια μηνύματα είναι "δικά μου" (δεξιά). */
export function MessageThread({
  messages,
  myId,
  onSend,
  placeholder = 'Γράψε μήνυμα…',
}: {
  messages: PartnerMessage[];
  myId: number;
  onSend: (body: string) => Promise<void>;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(body);
      setText('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      {messages.length === 0 ? <Text style={st.empty}>Δεν υπάρχουν μηνύματα ακόμα.</Text> : null}
      {messages.map((m) => {
        if (m.is_system) {
          return (
            <View key={m.id} style={st.system}>
              <Ionicons name="information-circle-outline" size={14} color={C.textMuted} />
              <Text style={st.systemText}>{m.body}</Text>
            </View>
          );
        }
        const mine = m.sender_id === myId;
        return (
          <View key={m.id} style={[st.row, mine && { justifyContent: 'flex-end' }]}>
            <View style={[st.bubble, mine ? st.mine : st.theirs]}>
              {!mine ? (
                <Text style={st.sender}>{m.sender_role === 'admin' ? 'Ομάδα SmartBeach' : m.sender_name}</Text>
              ) : null}
              <Text style={[st.body, mine && { color: '#FFFFFF' }]}>{m.body}</Text>
              <Text style={[st.time, mine && { color: 'rgba(255,255,255,0.75)' }]}>{when(m.created_at)}</Text>
            </View>
          </View>
        );
      })}
      {error ? <Text style={st.error}>{error}</Text> : null}
      <View style={st.inputBar}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={C.textFaint}
          multiline
          maxLength={2000}
          style={st.input}
          accessibilityLabel="Νέο μήνυμα"
        />
        <Pressable
          onPress={send}
          disabled={!text.trim() || busy}
          accessibilityRole="button"
          accessibilityLabel="Αποστολή μηνύματος"
          style={[st.send, (!text.trim() || busy) && { opacity: 0.4 }]}
        >
          {busy ? <ActivityIndicator color="#FFF" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  empty: { color: C.textMuted, fontSize: 14, marginBottom: 8 },
  row: { flexDirection: 'row', marginBottom: 8 },
  bubble: { maxWidth: '85%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  mine: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: '#EFEDE6', borderBottomLeftRadius: 4 },
  sender: { fontSize: 12, fontWeight: '700', color: C.primaryDark, marginBottom: 2 },
  body: { fontSize: 15, color: C.text, lineHeight: 20 },
  time: { fontSize: 11, color: C.textFaint, marginTop: 4, alignSelf: 'flex-end' },
  system: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginBottom: 8, paddingHorizontal: 4 },
  systemText: { flex: 1, fontSize: 13, color: C.textMuted, fontStyle: 'italic' },
  error: { color: C.danger, fontSize: 13, marginBottom: 6 },
  inputBar: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 4 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15,
    color: C.text,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
});
