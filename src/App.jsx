import { useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import ProtectedRoute from './components/ProtectedRoute';
import LiveGrading from './screens/LiveGrading';
import OperationsLog from './screens/OperationsLog';
import Analytics from './screens/Analytics';
import DeviceManagement from './screens/DeviceManagement';
import Reports from './screens/Reports';
import OCRPipeline from './screens/OCRPipeline';
import useMqtt from './hooks/useMqtt';
import { useAuth } from './context/AuthContext';
import { PERM } from './constants/permissions';

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
  } = useMqtt();

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
      <Sidebar availability={availability} />
      <TopBar
        variant={topBarVariant}
        connectionState={connectionState}
        deviceLocation={deviceLocation}
      />
      <main className="ml-60 p-lg min-h-[calc(100vh-64px)] bg-background">
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
          <Route
            path="/analytics"
            element={
              <ProtectedRoute permission={PERM.ANALYTICS_VIEW_BASIC}>
                <Analytics mqtt={mqttContext} />
              </ProtectedRoute>
            }
          />
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
          <Route
            path="/ocr-pipeline"
            element={
              <ProtectedRoute>
                <OCRPipeline mqtt={mqttContext} />
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
      </main>
    </div>
  );
}
