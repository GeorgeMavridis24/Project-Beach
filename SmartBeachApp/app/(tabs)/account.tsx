import { Ionicons } from '@expo/vector-icons';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Banner, Button, Card, Field, Screen, SectionTitle } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/dialogs';
import { ROLE_LABEL } from '@/lib/roles';
import type { PartnerRequest } from '@/lib/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Item = { href: Href; title: string; text: string; icon: IconName; roles: string[]; badge?: number };

const ITEMS: Item[] = [
  { href: '/admin/beaches', title: 'Το κατάστημά μου', text: 'Ωράριο λειτουργίας, στοιχεία, θέση στον χάρτη', icon: 'storefront-outline', roles: ['owner'] },
  { href: '/admin/checkin', title: 'Check-in εισόδου', text: 'Σάρωση QR και σημερινές κρατήσεις', icon: 'qr-code-outline', roles: ['staff', 'owner', 'admin'] },
  { href: '/admin/dashboard', title: 'Στατιστικά', text: 'Έσοδα, πληρότητα, δημοφιλείς θέσεις', icon: 'stats-chart-outline', roles: ['owner', 'admin'] },
  { href: '/admin/bookings', title: 'Κρατήσεις καταστήματος', text: 'Αναζήτηση, ακύρωση, αλλαγή ώρας', icon: 'list-outline', roles: ['owner', 'admin'] },
  { href: '/admin/sunbeds', title: 'Ξαπλώστρες', text: 'Διάταξη, τιμές, εκτός λειτουργίας', icon: 'grid-outline', roles: ['owner', 'admin'] },
  { href: '/admin/partners', title: 'Αιτήσεις συνεργατών', text: 'Νέοι επαγγελματίες, μηνύματα, έγκριση', icon: 'briefcase-outline', roles: ['admin'] },
  { href: '/admin/beaches', title: 'Καταστήματα', text: 'Ωράριο, καταστηματάρχες, θέση στον χάρτη', icon: 'umbrella-outline', roles: ['admin'] },
  { href: '/admin/users', title: 'Χρήστες', text: 'Ρόλοι πελατών, προσωπικού, καταστηματαρχών', icon: 'people-outline', roles: ['admin'] },
];

const STATUS = {
  pending: { text: 'Σε εξέταση', tone: 'warning' as const, icon: 'hourglass-outline' as IconName },
  approved: { text: 'Εγκρίθηκε', tone: 'success' as const, icon: 'checkmark-circle' as IconName },
  rejected: { text: 'Δεν εγκρίθηκε', tone: 'danger' as const, icon: 'close-circle' as IconName },
};

export default function AccountScreen() {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();
  const [request, setRequest] = useState<PartnerRequest | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityMsg, setSecurityMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const twoFactor = !!user?.two_factor_enabled;

  const toggleTwoFactor = async () => {
    setSecurityBusy(true);
    setSecurityMsg(null);
    try {
      await api('/auth/2fa', { method: 'POST', body: { enabled: !twoFactor, password } });
      await refreshUser();
      setSecurityMsg({
        tone: 'success',
        text: !twoFactor
          ? 'Ενεργοποιήθηκε! Από την επόμενη σύνδεση θα σου ζητάμε και κωδικό από το email.'
          : 'Απενεργοποιήθηκε ο έλεγχος σε 2 βήματα.',
      });
      setSecurityOpen(false);
      setPassword('');
    } catch (e: any) {
      setSecurityMsg({ tone: 'danger', text: e.message });
    } finally {
      setSecurityBusy(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      refreshUser(); // π.χ. αν εγκρίθηκε η αίτηση, ο ρόλος γίνεται «Καταστηματάρχης»
      if (user?.role === 'admin') {
        api<PartnerRequest[]>('/admin/partner-requests', { query: { status: 'pending' } })
          .then((list) => setPendingCount(list.length))
          .catch(() => {});
      } else {
        api<PartnerRequest[]>('/partner/requests/me')
          .then((list) => setRequest(list[0] ?? null))
          .catch(() => {});
      }
    }, [user?.role, refreshUser]),
  );

  const items = ITEMS.filter((i) => user && i.roles.includes(user.role)).map((i) =>
    i.href === '/admin/partners' ? { ...i, badge: pendingCount } : i,
  );

  const onLogout = async () => {
    if (await confirm('Αποσύνδεση', 'Θέλεις να αποσυνδεθείς;', 'Αποσύνδεση')) logout();
  };

  return (
    <Screen title="Προφίλ">
      <Card>
        <View style={st.profile}>
          <View style={st.avatar}>
            <Text style={st.avatarText}>{(user?.username ?? '?').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.name}>{user?.username}</Text>
            <Text style={st.email} numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
          {user ? <Badge text={ROLE_LABEL[user.role]} tone={user.role === 'user' ? 'neutral' : 'primary'} /> : null}
        </View>
      </Card>

      {user && user.role !== 'admin' ? (
        <>
          <SectionTitle>Συνεργασία</SectionTitle>
          {!request ? (
            <Card style={st.cta}>
              <Ionicons name="storefront-outline" size={28} color={C.primary} />
              <Text style={st.ctaTitle}>Έχεις beach bar;</Text>
              <Text style={st.ctaText}>
                Γίνε συνεργάτης του SmartBeach. Στήσε τον χώρο σου βήμα-βήμα (θέση, ωράριο, ξαπλώστρες) και δέξου κρατήσεις
                από την εφαρμογή.
              </Text>
              <Button title="Γίνε συνεργάτης" icon="arrow-forward" onPress={() => router.push('/partner/apply')} />
            </Card>
          ) : (
            <Card>
              <View style={st.reqHead}>
                <Text style={st.reqTitle}>{request.business_name}</Text>
                <Badge text={STATUS[request.status].text} tone={STATUS[request.status].tone} icon={STATUS[request.status].icon} />
              </View>
              <Text style={st.ctaText}>
                {request.status === 'pending'
                  ? 'Η ομάδα του SmartBeach εξετάζει την αίτησή σου. Θα ειδοποιηθείς με email.'
                  : request.status === 'approved'
                    ? 'Το κατάστημά σου είναι ενεργό! Διαχειρίσου το από τις επιλογές παρακάτω.'
                    : 'Η αίτηση δεν εγκρίθηκε. Δες το σχόλιο του διαχειριστή ή κάνε νέα αίτηση.'}
              </Text>
              <View style={st.actions}>
                <Button
                  title={request.unread_user ? `Μηνύματα (${request.unread_user} νέα)` : 'Η αίτησή μου & μηνύματα'}
                  icon="chatbubbles-outline"
                  small
                  variant={request.unread_user ? 'primary' : 'secondary'}
                  onPress={() => router.push('/partner/status')}
                />
                {request.status === 'rejected' ? (
                  <Button title="Νέα αίτηση" icon="refresh" small variant="ghost" onPress={() => router.push('/partner/apply')} />
                ) : null}
              </View>
            </Card>
          )}
        </>
      ) : null}

      <SectionTitle>Ασφάλεια</SectionTitle>
      <Card>
        <View style={st.reqHead}>
          <Text style={st.reqTitle}>Έλεγχος σε 2 βήματα</Text>
          <Badge text={twoFactor ? 'Ενεργός' : 'Ανενεργός'} tone={twoFactor ? 'success' : 'neutral'} icon={twoFactor ? 'shield-checkmark' : 'shield-outline'} />
        </View>
        <Text style={st.ctaText}>
          Σε κάθε σύνδεση, εκτός από τον κωδικό σου, θα ζητάμε και έναν 6ψήφιο κωδικό που στέλνουμε στο {user?.email}.
        </Text>
        {securityMsg ? <Banner text={securityMsg.text} tone={securityMsg.tone} /> : null}
        {securityOpen ? (
          <>
            <Field
              label="Γράψε τον κωδικό σου για επιβεβαίωση"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
            />
            <View style={st.actions}>
              <Button
                title={twoFactor ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}
                small
                variant={twoFactor ? 'danger' : 'primary'}
                onPress={toggleTwoFactor}
                loading={securityBusy}
                disabled={!password}
              />
              <Button title="Άκυρο" small variant="ghost" onPress={() => setSecurityOpen(false)} />
            </View>
          </>
        ) : (
          <Button
            title={twoFactor ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}
            icon={twoFactor ? 'shield-outline' : 'shield-checkmark-outline'}
            small
            variant="secondary"
            onPress={() => {
              setSecurityOpen(true);
              setSecurityMsg(null);
            }}
            style={{ alignSelf: 'flex-start' }}
          />
        )}
      </Card>

      {items.length ? <SectionTitle>Διαχείριση</SectionTitle> : null}
      {items.map((i) => (
        <Pressable
          key={i.title}
          onPress={() => router.push(i.href)}
          accessibilityRole="button"
          style={({ pressed }) => [st.item, pressed && { opacity: 0.85 }]}
        >
          <View style={st.icon}>
            <Ionicons name={i.icon} size={22} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>{i.title}</Text>
            <Text style={st.text}>{i.text}</Text>
          </View>
          {i.badge ? <Badge text={`${i.badge} νέες`} tone="warning" /> : null}
          <Ionicons name="chevron-forward" size={20} color={C.textFaint} />
        </Pressable>
      ))}

      <Button title="Αποσύνδεση" icon="log-out-outline" variant="danger" onPress={onLogout} style={{ marginTop: 16 }} />
    </Screen>
  );
}

const st = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  name: { fontSize: 17, fontWeight: '700', color: C.text },
  email: { fontSize: 14, color: C.textMuted },
  cta: { gap: 8 },
  ctaTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  ctaText: { fontSize: 14, color: C.textMuted, lineHeight: 20, marginBottom: 4 },
  reqHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  reqTitle: { fontSize: 17, fontWeight: '700', color: C.text, flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: C.text },
  text: { fontSize: 13, color: C.textMuted, marginTop: 2 },
});
