import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { C } from '@/constants/brand';

/** Πεδίο για κωδικό 6 ψηφίων: φαίνεται σαν 6 κουτάκια, γεμίζει και με επικόλληση. */
export function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<TextInput>(null);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="Κωδικός 6 ψηφίων">
      <View style={st.row}>
        {digits.map((d, i) => (
          <View key={i} style={[st.box, i === value.length && st.boxActive]}>
            <Text style={st.digit}>{d.trim()}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        style={st.hidden}
        accessibilityLabel="Γράψε τον κωδικό"
      />
    </Pressable>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  box: {
    flex: 1,
    aspectRatio: 0.85,
    maxWidth: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: C.primary, borderWidth: 2 },
  digit: { fontSize: 24, fontWeight: '700', color: C.text },
  hidden: { position: 'absolute', opacity: 0.01, width: '100%', height: '100%' },
});
