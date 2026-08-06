import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Route guard: redirects to /login if not authenticated.
 * Optionally checks a specific permission (shows "access denied" if missing).
 *
 * @param {{ children: React.ReactNode, permission?: string }} props
 */
export default function ProtectedRoute({ children, permission }) {
  const { isAuthenticated, hasPermission } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (permission && !hasPermission(permission)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center bg-surface-container border border-outline-variant rounded-xl p-xl max-w-md">
          <span className="material-symbols-outlined text-5xl text-error mb-md block">
            gavel
          </span>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-sm">
            Access Denied
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Your account does not have permission to access this page.
          </p>
          <p className="font-data-mono text-xs text-on-surface-variant/50 mt-sm">
            Required: {permission}
          </p>
        </div>
      </div>
    );
  }

  return children;
}
