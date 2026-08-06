import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    setLoading(true);

    try {
      await login(email, password);
      navigate('/', { replace: true });
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
            Bukidnon Operations — Sign In
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
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="admin@pineapple-hub.local"
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
              placeholder="Enter your password"
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
            {loading ? 'SIGNING IN...' : 'SIGN IN'}
          </button>
        </form>

        <p className="font-data-mono text-[10px] text-on-surface-variant/50 mt-lg text-center">
          Default: admin@pineapple-hub.local / admin123
        </p>
      </div>
    </div>
  );
}
