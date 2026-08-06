import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [permissions, setPermissions] = useState(() => {
    try {
      const saved = localStorage.getItem('permissions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  const isAuthenticated = !!token && !!user;

  // Verify token on mount
  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error('Session invalid');
          return res.json();
        })
        .then((data) => {
          setUser(data.user);
          setPermissions(data.user.permissions || []);
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('permissions', JSON.stringify(data.user.permissions || []));
        })
        .catch(() => {
          // Token invalid or expired — clear state
          setUser(null);
          setPermissions([]);
          setToken(null);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('permissions');
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // Get full user info with permissions
    const meRes = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    const meData = await meRes.json();

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(meData.user));
    localStorage.setItem('permissions', JSON.stringify(meData.user.permissions || []));

    setToken(data.token);
    setUser(meData.user);
    setPermissions(meData.user.permissions || []);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Best-effort logout
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('permissions');
    setToken(null);
    setUser(null);
    setPermissions([]);
  }, [token]);

  const hasPermission = useCallback(
    (permKey) => permissions.includes(permKey),
    [permissions]
  );

  const isAdmin = user?.role === 'admin';
  const isSupervisor = user?.role === 'supervisor';
  const isEmployee = user?.role === 'employee';

  const value = useMemo(
    () => ({
      user,
      permissions,
      token,
      login,
      logout,
      isAuthenticated,
      hasPermission,
      isAdmin,
      isSupervisor,
      isEmployee,
    }),
    [user, permissions, token, login, logout, isAuthenticated, hasPermission, isAdmin, isSupervisor, isEmployee]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
