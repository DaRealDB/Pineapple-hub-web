import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import LiveGrading from './screens/LiveGrading';
import OperationsLog from './screens/OperationsLog';
import DeviceManagement from './screens/DeviceManagement';
import Reports from './screens/Reports';
import useMqtt from './hooks/useMqtt';
import { useAuth } from './context/AuthContext';
import { PERM } from './constants/permissions';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * TopBar variant mapping per BUILD_SPEC.md Global Shell > TopBar.
 */
function getTopBarVariant(pathname) {
  if (pathname === '/devices') return 'devices';
  if (pathname === '/reports') return 'reports';
  return 'default';
}

export default function App() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const {
    connectionState,
    availability,
    weightG,
    grade,
    status,
    dataValid,
    zone1,
    zone2,
    captureArmed,
    switchStates,
    publishSwitchCommand,
    deviceState,
    publishDeviceCommand,
  } = useMqtt();

  /**
   * Log trigger via Express API → OCR backend (not MQTT).
   * Returns the response JSON so HMIPanel can show success/failure feedback.
   */
  const publishLogTrigger = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE}/api/hmi/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ device_id: 'scale1', action: 'log_trigger' }),
      });
      return await res.json();
    } catch (err) {
      console.warn('[LogTrigger] API call failed:', err.message);
      return null;
    }
  }, []);

  const [deviceLocation, setDeviceLocation] = useState(null);

  // Breadcrumb: fetch the first active device's location_path from the backend.
  useEffect(() => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/devices`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.devices?.length > 0) {
          // Prefer the first active device; fall back to the newest device.
          const device = data.devices.find((d) => d.is_active) || data.devices[0];
          setDeviceLocation(device.location_path ?? null);
        }
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const topBarVariant = getTopBarVariant(location.pathname);

  const mqttContext = {
    connectionState,
    availability,
    weightG,
    grade,
    status,
    dataValid,
    zone1,
    zone2,
    captureArmed,
    switchStates,
    publishSwitchCommand,
    deviceState,
    publishDeviceCommand,
    publishLogTrigger,
  };

  // Login & register pages — no shell. useMqtt() stays at the top level (rules of hooks),
  // and both pages redirect to / when already authenticated.
  if (location.pathname === '/login' || location.pathname === '/register') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar availability={availability} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <TopBar
        variant={topBarVariant}
        connectionState={connectionState}
        deviceLocation={deviceLocation}
      />
      <main className={`p-lg min-h-[calc(100vh-64px)] bg-background transition-all ${sidebarCollapsed ? 'ml-16' : 'ml-60'}`}>
        <ErrorBoundary>
          <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <LiveGrading mqtt={mqttContext} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/operations-log"
            element={
              <ProtectedRoute permission={PERM.OPERATIONS_LOG_VIEW}>
                <OperationsLog mqtt={mqttContext} />
              </ProtectedRoute>
            }
          />
          <Route path="/analytics" element={<Navigate to="/reports" replace />} />
          <Route
            path="/devices"
            element={
              <ProtectedRoute>
                <DeviceManagement mqtt={mqttContext} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports mqtt={mqttContext} />
              </ProtectedRoute>
            }
          />
          {/* Catch-all — redirect to grading screen when authenticated */}
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <LiveGrading mqtt={mqttContext} />
              </ProtectedRoute>
            }
          />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
