import React, { useEffect, useState } from 'react';
import { ImageBackground, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Field, Segmented } from '@/components/ui';
import { CodeInput } from '@/components/CodeInput';
import { C } from '@/constants/brand';
import { AuthStep, useAuth } from '@/lib/auth';
import { API_URL } from '@/lib/config';

export default function LoginScreen() {
  const { login, register, verifyEmail, verifyLogin, resendCode } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 2ο βήμα: κωδικός από το email (επιβεβαίωση εγγραφής ή σύνδεση σε 2 βήματα)
  const [step, setStep] = useState<Exclude<AuthStep, { status: 'ok' }> | null>(null);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password || (mode === 'register' && !username.trim())) {
      setError('Συμπλήρωσε όλα τα πεδία.');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      setError('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.');
      return;
    }
    setBusy(true);
    try {
      const res = mode === 'login' ? await login(email.trim(), password) : await register(username.trim(), email.trim(), password);
      if (res.status !== 'ok') {
        setStep(res);
        setCode('');
        setInfo(null);
        setCooldown(30);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (value = code) => {
    if (!step || value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      if (step.status === 'verify') await verifyEmail(step.email, value);
      else await verifyLogin(step.challenge, value);
    } catch (e: any) {
      setError(e.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!step) return;
    setError(null);
    try {
      await resendCode(step.status === 'verify' ? { email: step.email } : { challenge: step.challenge });
      setInfo('Στάλθηκε νέος κωδικός.');
      setCooldown(30);
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (step) {
    const target = step.status === 'verify' ? step.email : step.emailHint;
    return (
      <ImageBackground
        source={{ uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1200&auto=format&fit=crop' }}
        style={st.bg}
      >
        <View style={st.shade} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={st.center} keyboardShouldPersistTaps="handled">
            <Text style={st.logo}>SmartBeach</Text>
            <View style={st.card}>
              <Text style={st.stepTitle}>{step.status === 'verify' ? 'Επιβεβαίωση email' : 'Έλεγχος σε 2 βήματα'}</Text>
              <Text style={st.stepText}>
                {step.status === 'verify'
                  ? 'Για να ενεργοποιηθεί ο λογαριασμός σου, γράψε τον 6ψήφιο κωδικό που στείλαμε στο '
                  : 'Για την ασφάλειά σου, γράψε τον 6ψήφιο κωδικό που στείλαμε στο '}
                <Text style={{ fontWeight: '700', color: C.text }}>{target}</Text>.
              </Text>
              {step.delivery === 'server_console' ? (
                <Banner
                  text="Ο server δεν έχει ρυθμισμένο email: ο κωδικός εμφανίζεται στο παράθυρο «SmartBeach - server» (ή τρέξε το 3-RYTHMISI-EMAIL.bat)."
                  tone="warning"
                />
              ) : null}
              {error ? <Banner text={error} /> : null}
              {info ? <Banner text={info} tone="success" /> : null}
              <CodeInput
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (v.length === 6) confirmCode(v);
                }}
              />
              <Button title="Επιβεβαίωση" onPress={() => confirmCode()} loading={busy} disabled={code.length !== 6} style={{ marginTop: 12 }} />
              <Button
                title={cooldown > 0 ? `Στείλε νέο κωδικό (${cooldown}'')` : 'Στείλε νέο κωδικό'}
                variant="ghost"
                small
                disabled={cooldown > 0}
                onPress={resend}
                style={{ marginTop: 6 }}
              />
              <Button
                title="Πίσω"
                variant="ghost"
                small
                onPress={() => {
                  setStep(null);
                  setError(null);
                }}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground
      source={{ uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1200&auto=format&fit=crop' }}
      style={st.bg}
    >
      <View style={st.shade} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={st.center} keyboardShouldPersistTaps="handled">
          <Text style={st.logo}>SmartBeach</Text>
          <Text style={st.tagline}>Κλείσε ξαπλώστρα σε δευτερόλεπτα</Text>
          <View style={st.card}>
            <Segmented
              options={[
                { value: 'login', label: 'Είσοδος' },
                { value: 'register', label: 'Εγγραφή' },
              ]}
              value={mode}
              onChange={(v) => {
                setMode(v);
                setError(null);
              }}
            />
            {error ? <Banner text={error} /> : null}
            {mode === 'register' ? (
              <Field label="Όνομα" value={username} onChangeText={setUsername} placeholder="π.χ. Γιώργος" autoComplete="name" />
            ) : null}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Field
              label="Κωδικός"
              value={password}
              onChangeText={setPassword}
              placeholder={mode === 'register' ? 'Τουλάχιστον 6 χαρακτήρες' : '••••••'}
              secureTextEntry
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onSubmitEditing={submit}
            />
            <Button
              title={mode === 'login' ? 'Είσοδος' : 'Δημιουργία λογαριασμού'}
              onPress={submit}
              loading={busy}
              style={{ marginTop: 4 }}
            />
          </View>
          <Text style={st.server}>Server: {API_URL}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const st = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.seaDeep },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 40, 50, 0.35)' },
  center: { flexGrow: 1, justifyContent: 'center', padding: 20, alignItems: 'center' },
  logo: { fontSize: 40, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  tagline: { fontSize: 16, color: '#E8F6F8', marginBottom: 24, marginTop: 4 },
  card: { width: '100%', maxWidth: 420, backgroundColor: C.card, borderRadius: 16, padding: 20 },
  server: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 16 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 6 },
  stepText: { fontSize: 15, color: C.textMuted, marginBottom: 12, lineHeight: 21 },
});
