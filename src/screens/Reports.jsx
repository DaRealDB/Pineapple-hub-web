/**
 * Reports & Documentation screen — route: /reports
 *
 * Two sections:
 *   1. Performance Analytics (charts) — moved from standalone /analytics
 *   2. Report Generator cards + Recent Export History
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
  PieChart, Pie, Cell,
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const COLORS = ['#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];

// ── helpers ──────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function userName() {
  try { return JSON.parse(localStorage.getItem('user') || '{}').fullName || 'Admin User'; }
  catch { return 'Admin User'; }
}

async function fetchApi(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

// ── main component ───────────────────────────────────────────────────

export default function Reports({ mqtt }) {
  const { connectionState } = mqtt;
  const isLive = connectionState === 'connected';
  const navigate = useNavigate();

  // ── analytics state ──────────────────────────────────────────────
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [weightTrend, setWeightTrend] = useState(null);
  const [throughput, setThroughput] = useState(null);
  const [gradeDist, setGradeDist] = useState(null);
  const [uptime, setUptime] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchApi(`/api/analytics/weight-trend?days=${days}`).catch(e => (console.error(e), null)),
      fetchApi(`/api/analytics/throughput?days=${days}`).catch(e => (console.error(e), null)),
      fetchApi(`/api/analytics/grade-distribution?days=${days}`).catch(e => (console.error(e), null)),
      fetchApi(`/api/analytics/uptime?days=${days}`).catch(e => (console.error(e), null)),
    ]).then(([wt, tp, gd, up]) => {
      if (cancelled) return;
      setWeightTrend(wt); setThroughput(tp); setGradeDist(gd); setUptime(up);
      setLoading(false);
    }).catch(err => {
      if (cancelled) return;
      console.error('[Reports] Fetch error:', err);
      setError(err.message); setLoading(false);
    });
    return () => { cancelled = true; };
  }, [days]);

  const hasData = weightTrend?.data?.length > 0;

  function handleExportAnalytics() {
    const json = JSON.stringify({ weightTrend, throughput, gradeDist, uptime, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `analytics-${days}d-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // ── report generation state ──────────────────────────────────────
  const [generating, setGenerating] = useState(null);
  const [exportHistory, setExportHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      const data = await fetchApi('/api/reports/history');
      setExportHistory(data.exports || []);
    } catch { /* silent */ }
    setHistoryLoading(false);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleGenerate(reportType, format) {
    setGenerating(`${reportType}:${format}`);
    try {
      const endpoint = reportType === 'audit' ? 'daily-audit'
        : reportType === 'quality' ? 'grade-quality' : 'downtime';
      const date = document.querySelector(`[data-report-date="${reportType}"]`)?.value
        || new Date().toISOString().slice(0, 10);
      const res = await fetch(`${API_BASE}/api/reports/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ date, format, days }),
      });
      if (!res.ok) throw new Error(`Report generation failed: ${res.status}`);

      // Download the file
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      const ext = format === 'xlsx' ? 'xlsx' : 'html';
      a.download = `${reportType}-${date}.${ext}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);

      await loadHistory();
    } catch (err) {
      console.error('[Reports] Generate error:', err);
    }
    setGenerating(null);
  }

  // ── render ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <section className="mb-xl flex justify-between items-end">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">
            Reports &amp; Analytics
          </h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
            Performance analytics, operational reporting, and export-grade compliance documentation.
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <div className="flex items-center gap-xs px-sm py-1 bg-primary/10 border border-primary/20 rounded">
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-primary animate-pulse' : 'bg-[#EF4444]'}`} />
            <span className="font-label-caps text-[10px] text-primary">
              {isLive ? 'System Online' : 'MQTT Offline'}
            </span>
          </div>
          {loading && <span className="font-label-caps text-label-caps text-on-surface-variant/50">Loading...</span>}
          {error && <span className="font-label-caps text-label-caps text-[#EF4444]">ERROR: {error}</span>}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          SECTION 1 — Performance Analytics Charts
          ════════════════════════════════════════════════════════════ */}
      <section className="mb-xl">
        <div className="mb-lg flex justify-between items-end">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">
              Performance Analytics
            </h2>
          </div>
          <div className="flex gap-sm">
            <select value={days} onChange={e => setDays(Number(e.target.value))}
              className="px-md py-xs border border-outline-variant rounded font-label-caps text-label-caps text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-colors">
              <option value={1}>LAST 24 HRS</option>
              <option value={7}>LAST 7 DAYS</option>
              <option value={30}>LAST 30 DAYS</option>
            </select>
            <button onClick={handleExportAnalytics}
              className="px-md py-xs bg-primary-container text-on-primary-container rounded font-label-caps text-label-caps font-bold">
              EXPORT DATA
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
          <ChartCard title="Avg Crate Weight Stability Trend" icon="monitoring" loading={loading}
            subtitle={weightTrend?.data?.length ? `${weightTrend.data[weightTrend.data.length - 1]?.avg_weight_kg}kg` : null}>
            {weightTrend?.data?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={weightTrend.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={d => d?.slice(5) || ''} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} unit="kg" />
                  <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="avg_weight_kg" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} name="Avg Weight (kg)" />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </ChartCard>

          <ChartCard title="Throughput by Grade" loading={loading}
            subtitle={throughput?.data?.length ? `${throughput.data.reduce((s, d) => s + d.count, 0)} Crates` : null}>
            {throughput?.data?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={throughput.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={d => d?.slice(5) || ''} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                  <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="count" fill="#10B981" name="Crates" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </ChartCard>

          <ChartCard title="Overall Grade Distribution %" loading={loading}>
            {gradeDist?.data?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={gradeDist.data} dataKey="count" nameKey="grade"
                    cx="50%" cy="50%" outerRadius={80} label={({ grade, percentage }) => `${grade} ${percentage}%`}>
                    {gradeDist.data.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </ChartCard>

          <ChartCard title="System Uptime Score" loading={loading}
            subtitle={uptime ? `${uptime.uptime_pct}%` : null}>
            <div className="flex-1 flex flex-col items-center justify-center min-h-[200px]">
              <div className="relative w-32 h-32">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="3" />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831"
                    fill="none" stroke={uptime?.uptime_pct > 90 ? '#10B981' : uptime?.uptime_pct > 50 ? '#F59E0B' : '#EF4444'}
                    strokeWidth="3" strokeDasharray={`${uptime?.uptime_pct || 0}, 100`} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-data-mono text-xl text-on-surface">{uptime?.uptime_pct ?? '--'}%</span>
                </div>
              </div>
              <p className="font-body-md text-[11px] text-on-surface-variant/50 mt-sm">
                {uptime ? `${uptime.observed_intervals} of ${uptime.total_expected_intervals} hourly intervals` : 'No data'}
              </p>
            </div>
          </ChartCard>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          SECTION 2 — Report Generator Cards
          ════════════════════════════════════════════════════════════ */}
      <section className="mb-xl">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-lg">Generate Reports</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
          <ReportCard icon="description" badge="PDF / EXCEL" badgeClass="text-on-surface-variant bg-surface-container-high"
            title="Daily Audit Summary" reportType="audit"
            description="Complete daily grading audit with batch traceability and QA sign-off."
            generating={generating} onGenerate={handleGenerate} />

          <ReportCard icon="verified" badge="PDF / EXCEL" badgeClass="text-primary bg-primary/10 border border-primary/20"
            title="Grade Quality Export" reportType="quality" decorative
            description="Export grade distribution data with statistical process control metrics."
            generating={generating} onGenerate={handleGenerate} />

          <ReportCard icon="warning" badge="MAINTENANCE" badgeClass="text-tertiary bg-tertiary/10 border border-tertiary/20"
            title="Device Downtime Log" reportType="downtime"
            description="Scheduled and unscheduled downtime tracking with MTBF calculations."
            generating={generating} onGenerate={handleGenerate}
            disabled />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          SECTION 3 — Recent Export History
          ════════════════════════════════════════════════════════════ */}
      <section className="mb-xl">
        <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-md tracking-widest">
          RECENT EXPORT HISTORY
        </h3>
        <div className="bg-surface-container border border-outline-variant rounded overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-surface-container-high border-b border-outline-variant">
              <tr>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant">File Name</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant">Generated By</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant">Date</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant text-right">Download</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading ? (
                <tr><td colSpan="4" className="px-md py-xl text-center">
                  <span className="font-body-md text-on-surface-variant/50">Loading...</span>
                </td></tr>
              ) : exportHistory.length === 0 ? (
                <tr><td colSpan="4" className="px-md py-xl text-center">
                  <div className="flex flex-col items-center gap-sm">
                    <span className="material-symbols-outlined text-3xl text-on-surface-variant/20">folder_off</span>
                    <p className="font-body-md text-body-md text-on-surface-variant">No exports yet. Generate a report above.</p>
                  </div>
                </td></tr>
              ) : (
                exportHistory.map((exp) => (
                  <tr key={exp.id} className="border-b border-outline-variant/50 hover:bg-surface-container-high/50">
                    <td className="px-md py-sm font-data-mono text-sm text-on-surface">{exp.file_name}</td>
                    <td className="px-md py-sm font-body-md text-sm text-on-surface-variant">{exp.generated_by}</td>
                    <td className="px-md py-sm font-data-mono text-xs text-on-surface-variant">{exp.created_at?.slice(0, 16)?.replace('T', ' ')}</td>
                    <td className="px-md py-sm text-right">
                      <a href={`${API_BASE}/api/reports/download/${exp.id}`}
                        className="font-label-caps text-[10px] text-primary hover:underline">Download</a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="p-md flex justify-center border-t border-outline-variant">
            <button onClick={() => navigate('/operations-log')}
              className="font-label-caps text-[10px] text-on-surface-variant hover:text-primary transition-colors">
              VIEW FULL AUDIT LOG
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto bg-surface-container-low border border-outline-variant p-md rounded flex justify-between items-center">
        <div className="flex items-center gap-xl">
          <div className="flex items-center gap-xs">
            <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`} />
            <span className="font-data-mono text-[10px] text-on-surface-variant">
              {isLive ? 'MQTT: Connected' : 'MQTT: Offline'}
            </span>
          </div>
        </div>
        <span className="font-data-mono text-[10px] text-on-surface-variant">
          &copy; 2024 Bukidnon Fresh Pineapple Corp. &bull; Node ID: BFPC-04-B
        </span>
      </footer>
    </div>
  );
}

// ── sub-components ───────────────────────────────────────────────────

function ChartCard({ title, icon, subtitle, loading, children }) {
  return (
    <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col">
      <div className="flex justify-between items-start mb-md">
        <div>
          <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-xs">{title}</h3>
          {subtitle && <span className="font-data-mono text-2xl text-on-surface tabular-nums">{subtitle}</span>}
          {!subtitle && !loading && <span className="font-data-mono text-2xl text-on-surface-variant/30 tabular-nums">--</span>}
          {loading && <span className="font-data-mono text-sm text-on-surface-variant/40 animate-pulse">Loading...</span>}
        </div>
        {icon && <span className="material-symbols-outlined text-on-surface-variant">{icon}</span>}
      </div>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[200px] border border-outline-variant/30 rounded bg-surface-container-low/50">
      <div className="text-center">
        <span className="material-symbols-outlined text-3xl text-on-surface-variant/20 mb-sm block">bar_chart_4_bars</span>
        <p className="font-body-md text-body-md text-on-surface-variant/50">Awaiting historical data</p>
        <p className="font-data-mono text-[10px] text-on-surface-variant/30 mt-xs">Log crate data via Live Grading to populate charts</p>
      </div>
    </div>
  );
}

function ReportCard({ icon, badge, badgeClass, title, description, reportType, decorative, generating, onGenerate, disabled }) {
  const isGenerating = generating?.startsWith(reportType);
  const [showFormat, setShowFormat] = useState(false);
  const dateKey = `report-date-${reportType}`;

  function handlePick(format) {
    setShowFormat(false);
    onGenerate(reportType, format);
  }

  return (
    <article className={`bg-surface-container border border-outline-variant rounded p-lg flex flex-col justify-between group ${!disabled ? 'hover:border-primary/50' : ''} transition-all duration-300 ${decorative ? 'relative overflow-hidden' : ''}`}>
      {decorative && (
        <div className="absolute top-0 right-0 p-lg opacity-10 group-hover:opacity-20 transition-opacity">
          <span className="material-symbols-outlined leading-none" style={{ fontSize: '160px' }}>verified</span>
        </div>
      )}
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-md">
          <div className="p-sm bg-surface-variant rounded">
            <span className="material-symbols-outlined text-primary">{icon}</span>
          </div>
          <span className={`font-label-caps text-[10px] px-sm py-0.5 rounded ${badgeClass}`}>{badge}</span>
        </div>
        <h3 className="font-headline-sm text-headline-sm text-on-surface mb-sm">{title}</h3>
        <p className="font-body-md text-body-md text-on-surface-variant mb-xl leading-relaxed">{description}</p>
      </div>
      <div className="space-y-md relative z-10">
        <div>
          <label className="font-label-caps text-[10px] text-on-surface-variant block mb-xs">DATE</label>
          <div className="flex items-center gap-sm bg-surface-container-high border border-outline-variant rounded px-sm py-xs h-10">
            <span className="material-symbols-outlined text-xs text-on-surface-variant">calendar_today</span>
            <input data-report-date={reportType} className="bg-transparent border-none p-0 text-on-surface font-data-mono text-sm focus:ring-0 w-full"
              type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
        </div>
        <div className="flex flex-col gap-sm">
          {/* Format picker or Generate button */}
          {showFormat ? (
            <div className="flex gap-sm">
              <button onClick={() => handlePick('html')}
                className="flex-1 font-label-caps py-sm flex items-center justify-center gap-sm rounded bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/20 transition-all">
                <span className="material-symbols-outlined text-sm">picture_as_pdf</span> PDF
              </button>
              <button onClick={() => handlePick('xlsx')}
                className="flex-1 font-label-caps py-sm flex items-center justify-center gap-sm rounded bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] hover:bg-[#10B981]/20 transition-all">
                <span className="material-symbols-outlined text-sm">table</span> Excel
              </button>
            </div>
          ) : (
            <button onClick={() => setShowFormat(true)}
              disabled={generating !== null || disabled}
              className={`w-full font-label-caps py-sm flex items-center justify-center gap-sm rounded transition-all ${
                isGenerating ? 'bg-[#10B981] text-white' :
                disabled ? 'bg-surface-container-high text-on-surface-variant/40 cursor-not-allowed' :
                'bg-primary text-on-primary hover:brightness-110'
              }`}>
              <span className="material-symbols-outlined text-sm">{isGenerating ? 'sync' : 'article'}</span>
              {isGenerating ? 'PROCESSING...' : disabled ? 'UNAVAILABLE' : 'Generate Report'}
            </button>
          )}
          {/* Quick CSV export for non-maintenance cards */}
          {!disabled && (
            <button onClick={() => onGenerate(reportType, 'csv')}
              disabled={generating !== null}
              className="w-full border border-outline-variant text-on-surface font-label-caps py-sm rounded hover:bg-surface-variant transition-all disabled:opacity-30">
              Export CSV
            </button>
          )}
          {disabled && (
            <p className="font-label-caps text-[10px] text-tertiary text-center">Downtime tracking requires scale heartbeat events</p>
          )}
        </div>
      </div>
    </article>
  );
}
