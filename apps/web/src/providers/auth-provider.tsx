'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { clearSourceCache } from '@/lib/source-cache';
import { clearProductCache } from '@/lib/product-cache';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  departmentId: string | null;
  teamId: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: null, isLoading: true, logout: async () => {} });

export function AuthProvider({ children, initialUser }: { children: ReactNode; initialUser?: User | null }) {
  const [user, setUser] = useState<User | null>(initialUser ?? null);
  const [isLoading, setIsLoading] = useState(!initialUser);
  const router = useRouter();

  useEffect(() => {
    if (initialUser) return;
    // Fetch user on client mount
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setUser(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [initialUser]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    // Clear localStorage caches lưu giữ data theo user/role - tránh leak qua thiết bị shared.
    clearSourceCache();
    clearProductCache();
    setUser(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
