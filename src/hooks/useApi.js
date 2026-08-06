import { useCallback, useMemo } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Hook: returns authenticated fetch helpers.
 * Reads JWT from localStorage and attaches it as Bearer token.
 * Components should use AuthContext for login state; this hook is for API calls.
 */
export default function useApi() {
  const token = useMemo(() => localStorage.getItem('token'), []);

  /**
   * Base fetch wrapper — adds auth header and handles common errors.
   */
  const request = useCallback(
    async (path, options = {}) => {
      const url = `${API_BASE}${path}`;
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      };

      const res = await fetch(url, { ...options, headers });

      if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Don't redirect here — let AuthContext handle it
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Request failed: ${res.status}`);
      }

      return data;
    },
    [token]
  );

  const get = useCallback((path) => request(path), [request]);
  const post = useCallback((path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }), [request]);
  const put = useCallback((path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }), [request]);
  const del = useCallback((path) => request(path, { method: 'DELETE' }), [request]);

  return { get, post, put, del, token };
}
