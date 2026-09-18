'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, TOKEN_KEY, tokenStore } from './api';
import type { SessionUser } from './types';

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const token = tokenStore.get(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api.me());
    } catch (err) {
      // An expired/invalid token must not wedge the app in a loading state.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        tokenStore.remove(TOKEN_KEY);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const { token, user: sessionUser } = await api.login(email, password);
        tokenStore.set(TOKEN_KEY, token);
        // Fetch the full profile (student roll no, department, unread counts).
        const profile = await api.me().catch(() => sessionUser);
        setUser(profile);
        router.push('/dashboard');
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.status === 401
              ? 'Incorrect email or password.'
              : err.message
            : 'Sign-in failed. Please try again.';
        setError(message);
        throw err;
      }
    },
    [router],
  );

  const logout = useCallback(() => {
    tokenStore.remove(TOKEN_KEY);
    setUser(null);
    router.push('/login');
  }, [router]);

  const value = useMemo(() => ({ user, loading, error, login, logout, refresh }), [user, loading, error, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Convenience flags used for navigation guards and conditional UI. */
export function useRoleFlags() {
  const { user } = useAuth();
  const role = user?.role;
  return {
    role,
    isStudent: role === 'STUDENT',
    isFaculty: role === 'FACULTY',
    isOfficer: role === 'PLACEMENT_OFFICER',
    isAdmin: role === 'ADMIN',
    isStaff: role === 'ADMIN' || role === 'PLACEMENT_OFFICER' || role === 'FACULTY',
  };
}
