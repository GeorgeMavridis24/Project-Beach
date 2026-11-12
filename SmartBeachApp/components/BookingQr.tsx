import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { C } from '@/constants/brand';

/** QR εισόδου: το προσωπικό το σκανάρει και γίνεται check-in. */
export function BookingQr({ code, size = 180 }: { code: string; size?: number }) {
  return (
    <View style={q.wrap} accessible accessibilityLabel={`Κωδικός εισόδου ${code.split('').join(' ')}`}>
      <View style={q.qr}>
        <QRCode value={code} size={size} color="#0B0B0B" backgroundColor="#FFFFFF" />
      </View>
      <Text style={q.code}>{code.replace(/(.{4})/g, '$1 ').trim()}</Text>
      <Text style={q.hint}>Δείξε αυτόν τον κωδικό στην είσοδο</Text>
    </View>
  );
}

const q = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 8 },
  qr: { padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: C.border },
  code: { fontSize: 20, fontWeight: '700', letterSpacing: 2, marginTop: 10, color: C.text, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 13, color: C.textMuted, marginTop: 2 },
});
