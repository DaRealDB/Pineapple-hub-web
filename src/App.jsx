import { Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import LiveGrading from './screens/LiveGrading';
import OperationsLog from './screens/OperationsLog';
import Analytics from './screens/Analytics';
import DeviceManagement from './screens/DeviceManagement';
import Reports from './screens/Reports';
import SimpleOCR from './screens/SimpleOCR';
import OCRPipeline from './screens/OCRPipeline';
import useMqtt from './hooks/useMqtt';
import useWebSocket from './hooks/useWebSocket';

/**
 * TopBar variant mapping per BUILD_SPEC.md Global Shell > TopBar.
 */
function getTopBarVariant(pathname) {
  if (pathname === '/devices') return 'devices';
  if (pathname === '/reports') return 'reports';
  if (pathname === '/ocr-pipeline') return 'ocr-pipeline';
  return 'default';
}

export default function App() {
  const location = useLocation();

  const {
    connectionState: mqttConnectionState,
    availability,
    weightG,
    grade,
    status,
    dataValid,
  } = useMqtt();

  const {
    connectionState: wsConnectionState,
    pipelineStatus,
  } = useWebSocket();

  const topBarVariant = getTopBarVariant(location.pathname);

  const mqttContext = {
    connectionState: mqttConnectionState,
    availability,
    weightG,
    grade,
    status,
    dataValid,
  };

  const wsContext = {
    connectionState: wsConnectionState,
    pipelineStatus,
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar availability={availability} pipelineStatus={pipelineStatus} />
      <TopBar variant={topBarVariant} connectionState={mqttConnectionState} pipelineConnectionState={wsConnectionState} />
      <main className="ml-60 p-lg min-h-[calc(100vh-64px)] bg-background">
        <Routes>
          <Route
            path="/"
            element={<LiveGrading mqtt={mqttContext} />}
          />
          <Route
            path="/operations-log"
            element={<OperationsLog mqtt={mqttContext} />}
          />
          <Route
            path="/analytics"
            element={<Analytics mqtt={mqttContext} />}
          />
          <Route
            path="/devices"
            element={<DeviceManagement mqtt={mqttContext} />}
          />
          <Route
            path="/reports"
            element={<Reports mqtt={mqttContext} />}
          />
          <Route
            path="/simple-ocr"
            element={<SimpleOCR />}
          />
          <Route
            path="/ocr-pipeline"
            element={<OCRPipeline />}
          />
        </Routes>
      </main>
    </div>
  );
}
