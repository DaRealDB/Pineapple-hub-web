/**
 * Performance Analytics screen — route: /analytics
 *
 * 4 panels backed by Express /api/analytics/* aggregation endpoints.
 * Data source: operations_log (OCR pipeline database), queried via Express.
 *
 * Permission-gated: employees see the basic view (Avg Crate Weight only);
 * admins/supervisors with ANALYTICS_VIEW_FULL see all charts and exports.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { PERM } from '../constants/permissions';
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

async function fetchAnalytics(endpoint, days) {
  const url = `${API_BASE}/api/analytics/${endpoint}?days=${days}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`${endpoint} failed: ${res.status}`);
  return res.json();
}

// ── main component ───────────────────────────────────────────────────

export default function Analytics({ mqtt }) {
  const { connectionState } = mqtt;
  const isLive = connectionState === 'connected';
  const { hasPermission } = useAuth();
  const canViewFull = hasPermission(PERM.ANALYTICS_VIEW_FULL);
  const canViewBasic = hasPermission(PERM.ANALYTICS_VIEW_BASIC);

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
      fetchAnalytics('weight-trend', days).catch(e => (console.error(e), null)),
      canViewFull ? fetchAnalytics('throughput', days).catch(e => (console.error(e), null)) : Promise.resolve(null),
      canViewFull ? fetchAnalytics('grade-distribution', days).catch(e => (console.error(e), null)) : Promise.resolve(null),
      canViewFull ? fetchAnalytics('uptime', days).catch(e => (console.error(e), null)) : Promise.resolve(null),
    ])
      .then(([wt, tp, gd, up]) => {
        if (cancelled) return;
        setWeightTrend(wt);
        setThroughput(tp);
        setGradeDist(gd);
        setUptime(up);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('[Analytics] Fetch error:', err);
        setError(err.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [days, canViewFull]);

  // ── permission gate ──────────────────────────────────────────────
  if (!canViewBasic) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-md block">
            analytics
          </span>
          <p className="font-body-md text-body-md text-on-surface-variant">
            You do not have access to analytics.
          </p>
        </div>
      </div>
    );
  }

  const hasData = weightTrend?.data?.length > 0;

  // ── export handler ──────────────────────────────────────────────
  function handleExport() {
    const json = JSON.stringify({ weightTrend, throughput, gradeDist, uptime, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-export-${days}d-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── render ──────────────────────────────────────────────────────
  return (
    <div className="h-full">
      {/* Header */}
      <div className="mb-lg flex justify-between items-end">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">
            Performance Analytics
          </h2>
          <div className="flex items-center gap-sm">
            {isLive && (
              <>
                <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                <span className="font-label-caps text-label-caps text-[#10B981]">
                  SYSTEM ACTIVE
                </span>
              </>
            )}
            {loading && (
              <span className="font-label-caps text-label-caps text-on-surface-variant/50 ml-sm">
                Loading...
              </span>
            )}
            {error && (
              <span className="font-label-caps text-label-caps text-[#EF4444] ml-sm">
                ERROR: {error}
              </span>
            )}
          </div>
        </div>
        {canViewFull && (
          <div className="flex gap-sm">
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="px-md py-xs border border-outline-variant rounded font-label-caps text-label-caps text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-colors"
            >
              <option value={1}>LAST 24 HRS</option>
              <option value={7}>LAST 7 DAYS</option>
              <option value={30}>LAST 30 DAYS</option>
            </select>
            <button
              onClick={handleExport}
              className="px-md py-xs bg-primary-container text-on-primary-container rounded font-label-caps text-label-caps font-bold"
            >
              EXPORT DATA
            </button>
          </div>
        )}
      </div>

      {/* 2×2 Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        {/* 1. Avg Crate Weight Stability Trend */}
        <ChartCard title="Avg Crate Weight Stability Trend" icon="monitoring" loading={loading}
          subtitle={weightTrend?.data?.length ? `${weightTrend.data[weightTrend.data.length - 1]?.avg_weight_kg}kg` : null}>
          {weightTrend?.data?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={weightTrend.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }}
                  tickFormatter={d => d?.slice(5) || ''} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} unit="kg" />
                <Tooltip
                  contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={d => `Date: ${d}`}
                />
                <Line type="monotone" dataKey="avg_weight_kg" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} name="Avg Weight (kg)" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState hasData={hasData} />
          )}
        </ChartCard>

        {/* Full-analytics charts — admin/supervisor only */}
        {canViewFull && (
          <>
            {/* 2. Throughput by Grade */}
            <ChartCard title="Throughput by Grade" subtitle={throughput?.data?.length ? `${throughput.data.reduce((s, d) => s + d.count, 0)} Crates` : null}
              loading={loading}>
              {throughput?.data?.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={throughput.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }}
                      tickFormatter={d => d?.slice(5) || ''} />
                    <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                    <Tooltip
                      contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="count" fill="#10B981" name="Crates" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState hasData={hasData} />
              )}
            </ChartCard>

            {/* 3. Overall Grade Distribution */}
            <ChartCard title="Overall Grade Distribution %" loading={loading}>
              {gradeDist?.data?.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={gradeDist.data} dataKey="count" nameKey="grade"
                      cx="50%" cy="50%" outerRadius={80} label={({ grade, percentage }) => `${grade} ${percentage}%`}>
                      {gradeDist.data.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState hasData={hasData} />
              )}
            </ChartCard>

            {/* 4. System Uptime Score */}
            <ChartCard title="System Uptime Score" loading={loading}
              subtitle={uptime ? `${uptime.uptime_pct}%` : null}>
              <div className="flex-1 flex flex-col items-center justify-center min-h-[200px]">
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="3" />
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831"
                      fill="none" stroke={uptime?.uptime_pct > 90 ? '#10B981' : uptime?.uptime_pct > 50 ? '#F59E0B' : '#EF4444'}
                      strokeWidth="3"
                      strokeDasharray={`${uptime?.uptime_pct || 0}, 100`} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-data-mono text-xl text-on-surface">
                      {uptime?.uptime_pct ?? '--'}%
                    </span>
                  </div>
                </div>
                <p className="font-body-md text-[11px] text-on-surface-variant/50 mt-sm">
                  {uptime ? `${uptime.observed_intervals} of ${uptime.total_expected_intervals} hourly intervals` : 'No data'}
                </p>
              </div>
            </ChartCard>
          </>
        )}
      </div>

      {/* Employee simplification note */}
      {!canViewFull && (
        <p className="font-body-md text-[11px] text-on-surface-variant/50 mt-lg text-center">
          Basic view — contact a supervisor for detailed analytics access.
        </p>
      )}
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
          {subtitle && (
            <span className="font-data-mono text-2xl text-on-surface tabular-nums">{subtitle}</span>
          )}
          {!subtitle && !loading && (
            <span className="font-data-mono text-2xl text-on-surface-variant/30 tabular-nums">--</span>
          )}
          {loading && (
            <span className="font-data-mono text-sm text-on-surface-variant/40 animate-pulse">Loading...</span>
          )}
        </div>
        {icon && <span className="material-symbols-outlined text-on-surface-variant">{icon}</span>}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ hasData }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[200px] border border-outline-variant/30 rounded bg-surface-container-low/50">
      <div className="text-center">
        <span className="material-symbols-outlined text-3xl text-on-surface-variant/20 mb-sm block">
          bar_chart_4_bars
        </span>
        <p className="font-body-md text-body-md text-on-surface-variant/50">
          {hasData ? 'No data for this panel' : 'Awaiting historical data'}
        </p>
        <p className="font-data-mono text-[10px] text-on-surface-variant/30 mt-xs">
          {hasData ? 'Try adjusting the date range' : 'Log crate data via Live Grading to populate charts'}
        </p>
      </div>
    </div>
  );
}
