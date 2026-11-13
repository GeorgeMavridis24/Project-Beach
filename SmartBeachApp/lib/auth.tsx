import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { api, setAuthToken, setUnauthorizedHandler } from './api';
import type { AppConfig, User } from './types';

const TOKEN_KEY = 'smartbeach_token';

// Το token αποθηκεύεται κρυπτογραφημένο (Keychain / Keystore) στο κινητό.
// Στο web το SecureStore δεν υπάρχει, οπότε χρησιμοποιείται localStorage.
const storage = {
  async get(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(value: string) {
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(TOKEN_KEY, value);
      else await SecureStore.setItemAsync(TOKEN_KEY, value);
    } catch {}
  },
  async remove() {
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.removeItem(TOKEN_KEY);
      else await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {}
  },
};

export type Delivery = 'email' | 'server_console';

/** Αποτέλεσμα εγγραφής / σύνδεσης: έτοιμο, ή χρειάζεται κωδικός από το email. */
export type AuthStep =
  | { status: 'ok' }
  | { status: 'verify'; email: string; delivery: Delivery }
  | { status: '2fa'; challenge: string; emailHint: string; delivery: Delivery };

type TokenResponse = { access_token: string; user: User };
type LoginResponse = Partial<TokenResponse> & {
  verification_required?: boolean;
  two_factor_required?: boolean;
  email?: string;
  challenge?: string;
  email_hint?: string;
  delivery?: Delivery;
};

type AuthState = {
  user: User | null;
  config: AppConfig | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthStep>;
  register: (username: string, email: string, password: string) => Promise<AuthStep>;
  /** Κωδικός από το email μετά την εγγραφή */
  verifyEmail: (email: string, code: string) => Promise<void>;
  /** Κωδικός από το email στη σύνδεση σε 2 βήματα */
  verifyLogin: (challenge: string, code: string) => Promise<void>;
  resendCode: (target: { email?: string; challenge?: string }) => Promise<void>;
  logout: () => Promise<void>;
  /** Ξαναδιαβάζει τον χρήστη (π.χ. όταν εγκριθεί και γίνει καταστηματάρχης). */
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await storage.remove();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
    });
    (async () => {
      api<AppConfig>('/config').then(setConfig).catch(() => {});
      const saved = await storage.get();
      if (saved) {
        setAuthToken(saved);
        try {
          setUser(await api<User>('/auth/me'));
        } catch {
          setAuthToken(null);
          await storage.remove();
        }
      }
      setLoading(false);
    })();
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const finish = useCallback(
    async (res: TokenResponse) => {
      setAuthToken(res.access_token);
      await storage.set(res.access_token);
      setUser(res.user);
      if (!config) api<AppConfig>('/config').then(setConfig).catch(() => {});
    },
    [config],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<AuthStep> => {
      const res = await api<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } });
      if (res.verification_required) return { status: 'verify', email: res.email ?? email, delivery: res.delivery ?? 'email' };
      if (res.two_factor_required) {
        return { status: '2fa', challenge: res.challenge ?? '', emailHint: res.email_hint ?? '', delivery: res.delivery ?? 'email' };
      }
      await finish(res as TokenResponse);
      return { status: 'ok' };
    },
    [finish],
  );

  const register = useCallback(async (username: string, email: string, password: string): Promise<AuthStep> => {
    const res = await api<LoginResponse>('/auth/register', { method: 'POST', body: { username, email, password } });
    return { status: 'verify', email: res.email ?? email, delivery: res.delivery ?? 'email' };
  }, []);

  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      await finish(await api<TokenResponse>('/auth/verify-email', { method: 'POST', body: { email, code } }));
    },
    [finish],
  );

  const verifyLogin = useCallback(
    async (challenge: string, code: string) => {
      await finish(await api<TokenResponse>('/auth/login/verify', { method: 'POST', body: { challenge, code } }));
    },
    [finish],
  );

  const resendCode = useCallback(async (target: { email?: string; challenge?: string }) => {
    await api('/auth/resend-code', { method: 'POST', body: target });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api<User>('/auth/me');
      setUser((cur) =>
        cur && cur.role === me.role && cur.username === me.username && cur.two_factor_enabled === me.two_factor_enabled ? cur : me,
      );
    } catch {}
  }, []);

  const value = useMemo(
    () => ({ user, config, loading, login, register, verifyEmail, verifyLogin, resendCode, logout, refreshUser }),
    [user, config, loading, login, register, verifyEmail, verifyLogin, resendCode, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
