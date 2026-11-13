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

type AuthState = {
  user: User | null;
  config: AppConfig | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
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

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ access_token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setAuthToken(res.access_token);
    await storage.set(res.access_token);
    setUser(res.user);
    if (!config) api<AppConfig>('/config').then(setConfig).catch(() => {});
  }, [config]);

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      await api('/auth/register', { method: 'POST', body: { username, email, password } });
      await login(email, password);
    },
    [login],
  );

  const refreshUser = useCallback(async () => {
    try {
      const me = await api<User>('/auth/me');
      setUser((cur) => (cur && cur.role === me.role && cur.username === me.username ? cur : me));
    } catch {}
  }, []);

  const value = useMemo(
    () => ({ user, config, loading, login, register, logout, refreshUser }),
    [user, config, loading, login, register, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
