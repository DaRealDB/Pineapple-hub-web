import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function RegisterPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already logged in — redirect
  if (isAuthenticated) {
    navigate('/', { replace: true });
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Save token and redirect — same pattern as login
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Fetch full user info with permissions
      const meRes = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      const meData = await meRes.json();
      localStorage.setItem('user', JSON.stringify(meData.user));
      localStorage.setItem('permissions', JSON.stringify(meData.user.permissions || []));

      // Reload the page so AuthProvider picks up the new token from localStorage
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="bg-surface-container border border-outline-variant rounded-xl p-xl w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-xl">
          <h1 className="font-headline-md text-headline-md font-bold text-primary mb-xs">
            Pineapple Hub
          </h1>
          <p className="font-label-caps text-label-caps text-on-surface-variant">
            Bukidnon Operations — Create Account
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-error-container border border-error/30 rounded p-sm mb-lg">
            <p className="text-on-error-container font-body-md text-body-md">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-lg">
          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant block mb-xs">
              FULL NAME
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoFocus
              placeholder="Juan Dela Cruz"
              className="w-full bg-surface-container-high border border-outline-variant rounded px-md py-sm
                         text-on-surface font-body-md placeholder-on-surface-variant/50
                         focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>

          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant block mb-xs">
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full bg-surface-container-high border border-outline-variant rounded px-md py-sm
                         text-on-surface font-body-md placeholder-on-surface-variant/50
                         focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>

          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant block mb-xs">
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="At least 6 characters"
              className="w-full bg-surface-container-high border border-outline-variant rounded px-md py-sm
                         text-on-surface font-body-md placeholder-on-surface-variant/50
                         focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>

          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant block mb-xs">
              CONFIRM PASSWORD
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Re-enter your password"
              className="w-full bg-surface-container-high border border-outline-variant rounded px-md py-sm
                         text-on-surface font-body-md placeholder-on-surface-variant/50
                         focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary font-label-caps font-bold py-sm rounded
                       hover:brightness-110 active:scale-[0.98] transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <p className="font-body-md text-body-md text-on-surface-variant mt-lg text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
