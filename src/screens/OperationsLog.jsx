import { useState, useEffect } from 'react';
import StatusPill from '../components/StatusPill';

const OCR_API_BASE = import.meta.env.VITE_OCR_API_URL || 'http://127.0.0.1:8000';

/**
 * Operations Log screen — route: /operations-log
 *
 * Shows historical crate logging events from the OCR backend's
 * operations_log table (same data source as the LiveGrading crate log card).
 */
export default function OperationsLog({ mqtt }) {
  const { connectionState } = mqtt;
  const isLive = connectionState === 'connected';
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Fetch logs from OCR backend
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${OCR_API_BASE}/api/pipeline/crate-logs?limit=100`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch {}
      setLoading(false);
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  const filtered = search
    ? logs.filter((l) => (l.batch_id || '').toLowerCase().includes(search.toLowerCase()))
    : logs;

  return (
    <div className="h-full flex flex-col">
      {/* Filter Bar */}
      <section className="p-lg bg-surface-container-low/50 border-b border-outline-variant mb-lg rounded">
        <div className="flex flex-wrap items-end gap-md">
          <div className="flex flex-col gap-xs flex-1">
            <label className="font-label-caps text-[10px] text-on-surface-variant">BATCH ID SEARCH</label>
            <div className="flex items-center bg-surface-container-high border border-outline-variant rounded px-sm py-xs h-10 focus-within:border-primary transition-colors">
              <span className="material-symbols-outlined text-sm mr-xs">search</span>
              <input
                className="bg-transparent border-none focus:ring-0 text-body-md w-full text-on-surface placeholder-on-surface-variant"
                placeholder="Filter by Batch ID..."
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-sm">
            <StatusPill variant={isLive ? 'online' : 'offline'} label={isLive ? 'MQTT LIVE' : 'MQTT OFFLINE'} />
            <span className="font-data-mono text-xs text-on-surface-variant">{logs.length} entries</span>
          </div>
        </div>
      </section>

      {/* Data Table */}
      <section className="flex-1 overflow-auto">
        <div className="bg-surface-container border border-outline-variant rounded-lg overflow-hidden flex flex-col h-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-highest border-b border-outline-variant sticky top-0">
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Timestamp</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Batch ID</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Weight (kg)</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Grade</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Confidence</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Trigger</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-md py-xl text-center">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 animate-spin block mb-sm">sync</span>
                    <p className="font-body-md text-body-md text-on-surface-variant">Loading logs...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-md py-xl text-center">
                    <div className="flex flex-col items-center gap-sm">
                      <span className="material-symbols-outlined text-4xl text-on-surface-variant/30">
                        {isLive ? 'hourglass_top' : 'cloud_off'}
                      </span>
                      <p className="font-body-md text-body-md text-on-surface-variant">
                        {isLive
                          ? 'No log entries yet. Start the camera pipeline and wave to confirm a crate.'
                          : 'Operations log unavailable — MQTT broker is offline.'}
                      </p>
                      <p className="font-data-mono text-xs text-on-surface-variant/50">
                        Pulls from OCR backend operations_log via {OCR_API_BASE}/api/pipeline/crate-logs
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="border-b border-outline-variant hover:bg-surface-container-low transition-colors">
                    <td className="px-md py-sm font-data-mono text-xs text-on-surface-variant whitespace-nowrap">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', month: 'short', day: 'numeric', hour12: false }) : '--'}
                    </td>
                    <td className="px-md py-sm font-data-mono text-xs text-primary font-bold">{log.batch_id || '--'}</td>
                    <td className="px-md py-sm font-data-mono text-xs text-on-surface">
                      {log.weight_g != null ? (log.weight_g / 1000).toFixed(3) : '--'}
                    </td>
                    <td className="px-md py-sm">
                      <span className={`font-label-caps text-[10px] px-xs py-[1px] rounded ${
                        log.grade === 'grade_1' ? 'bg-primary/10 text-primary' :
                        log.grade === 'light' ? 'bg-tertiary/10 text-tertiary' :
                        'bg-on-surface-variant/10 text-on-surface-variant'
                      }`}>{log.grade || '--'}</span>
                    </td>
                    <td className="px-md py-sm font-data-mono text-xs text-on-surface-variant">
                      {log.ocr_confidence != null ? `${(log.ocr_confidence * 100).toFixed(0)}%` : '--'}
                    </td>
                    <td className="px-md py-sm">
                      <span className="font-label-caps text-[9px] text-on-surface-variant">
                        {log.capture_trigger === 'hand_wave' ? '👋 WAVE' : log.capture_trigger || '--'}
                      </span>
                    </td>
                    <td className="px-md py-sm">
                      <StatusPill
                        variant={log.audit_status === 'confirmed' ? 'online' : log.audit_status === 'flagged' ? 'occupied' : 'pending'}
                        label={log.audit_status || 'pending'}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Footer */}
          <div className="mt-auto bg-surface-container-low border-t border-outline-variant p-md flex items-center justify-between">
            <span className="font-body-md text-on-surface-variant">
              {filtered.length} of {logs.length} entries
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
