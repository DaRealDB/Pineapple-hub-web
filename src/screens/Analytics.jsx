import { SEED_STACKED_BAR } from '../data/mockData';

/**
 * Performance Analytics screen — route: /analytics
 * Reference: stitch_bukidnon_pineapple_operations_hub/performance_analytics/code.html
 *
 * Per BUILD_SPEC.md Screen: Performance Analytics.
 * 2×2 chart grid: line chart, stacked bar, donut, radial gauge.
 * Mock data only — historical chart data has no live MQTT source.
 *
 * @param {{ mqtt: object }} props
 */
export default function Analytics({ mqtt }) {
  const { connectionState } = mqtt;
  const isLive = connectionState === 'connected';

  return (
    <div className="h-full">
      {/* Header */}
      <div className="mb-lg flex justify-between items-end">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">
            Performance Analytics
          </h2>
          <div className="flex items-center gap-sm">
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span className="font-label-caps text-label-caps text-[#10B981]">
              SYSTEM ACTIVE • {isLive ? 'REAL-TIME SYNC' : 'SEED DATA'}
            </span>
          </div>
        </div>
        <div className="flex gap-sm">
          <button className="px-md py-xs border border-outline-variant rounded font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-high transition-colors">
            LAST 7 DAYS
          </button>
          <button className="px-md py-xs bg-primary-container text-on-primary-container rounded font-label-caps text-label-caps font-bold">
            EXPORT DATA
          </button>
        </div>
      </div>

      {/* 2×2 Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        {/* 1. Avg Weight Stability Trend (Line Chart) */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col hover:border-primary transition-colors duration-300">
          <div className="flex justify-between items-start mb-md">
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-xs">
                Avg Weight Stability Trend
              </h3>
              <div className="flex items-baseline gap-sm">
                <span className="font-data-mono text-2xl text-primary tabular-nums">
                  1.42kg
                </span>
                <span className="font-label-caps text-[10px] text-[#10B981]">
                  ± 0.04kg DRIFT
                </span>
              </div>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">
              monitoring
            </span>
          </div>
          <div className="flex-1 border-l border-b border-outline-variant relative min-h-[240px]">
            {/* Custom grid background */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(#3d494c 1px, transparent 1px), linear-gradient(90deg, #3d494c 1px, transparent 1px)',
                backgroundSize: '24px 24px',
                backgroundPosition: 'center',
              }}
            />
            <svg className="w-full h-full relative z-10" viewBox="0 0 400 200">
              <defs>
                <linearGradient id="lineGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#06B6D4" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
              {/* Reference line */}
              <line
                opacity="0.5"
                stroke="#869397"
                strokeDasharray="4"
                x1="0"
                x2="400"
                y1="140"
                y2="140"
              />
              {/* Line path */}
              <path
                d="M 0 140 Q 50 130, 100 145 T 200 135 T 300 142 T 400 138"
                fill="none"
                stroke="#06B6D4"
                strokeWidth="2"
              />
              {/* Area fill */}
              <path
                d="M 0 140 Q 50 130, 100 145 T 200 135 T 300 142 T 400 138 V 200 H 0 Z"
                fill="url(#lineGradient)"
                opacity="0.1"
              />
            </svg>
          </div>
        </div>

        {/* 2. Throughput by Grade (Stacked Bar Chart) */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col hover:border-primary transition-colors duration-300">
          <div className="flex justify-between items-start mb-md">
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-xs">
                Throughput by Grade (7 Days)
              </h3>
              <span className="font-data-mono text-2xl text-on-surface tabular-nums">
                12,480 Units
              </span>
            </div>
            <div className="flex flex-col items-end gap-xs">
              <div className="flex items-center gap-xs">
                <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                <span className="text-[10px] font-label-caps">G1</span>
              </div>
              <div className="flex items-center gap-xs">
                <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                <span className="text-[10px] font-label-caps">G2</span>
              </div>
              <div className="flex items-center gap-xs">
                <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
                <span className="text-[10px] font-label-caps">REJ</span>
              </div>
            </div>
          </div>
          <div className="flex-1 flex items-baseline justify-around px-md pt-lg">
            {SEED_STACKED_BAR.map((day) => (
              <div
                key={day.day}
                className="flex flex-col-reverse w-8 h-full gap-[2px]"
              >
                <div
                  className="bg-[#10B981] rounded-t-sm"
                  style={{ height: `${day.g1}%` }}
                />
                <div
                  className="bg-[#F59E0B]"
                  style={{ height: `${day.g2}%` }}
                />
                <div
                  className="bg-[#EF4444]"
                  style={{ height: `${day.rej}%` }}
                />
                <span className="mt-xs text-[10px] font-label-caps text-center text-on-surface-variant">
                  {day.day}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Overall Grade Distribution (Donut Chart) */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col hover:border-primary transition-colors duration-300">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-md text-center">
            Overall Grade Distribution %
          </h3>
          <div className="flex-1 flex items-center justify-center relative">
            <svg className="w-48 h-48 -rotate-90" viewBox="0 0 100 100">
              {/* Grade 1: 75% */}
              <circle
                cx="50"
                cy="50"
                fill="none"
                r="40"
                stroke="#10B981"
                strokeDasharray="188.5 251.3"
                strokeWidth="12"
              />
              {/* Grade 2: 20% */}
              <circle
                cx="50"
                cy="50"
                fill="none"
                r="40"
                stroke="#F59E0B"
                strokeDasharray="50.2 251.3"
                strokeDashoffset="-188.5"
                strokeWidth="12"
              />
              {/* Rejections: 5% */}
              <circle
                cx="50"
                cy="50"
                fill="none"
                r="40"
                stroke="#EF4444"
                strokeDasharray="12.6 251.3"
                strokeDashoffset="-238.7"
                strokeWidth="12"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-headline-md text-headline-md text-on-surface">
                95%
              </span>
              <span className="font-label-caps text-[10px] text-on-surface-variant">
                QUALITY YIELD
              </span>
            </div>
          </div>
          <div className="mt-md flex justify-around border-t border-outline-variant pt-md">
            <div className="text-center">
              <p className="font-label-caps text-[10px] text-on-surface-variant">
                GRADE 1
              </p>
              <p className="font-data-mono text-sm text-[#10B981] tabular-nums">
                75%
              </p>
            </div>
            <div className="text-center">
              <p className="font-label-caps text-[10px] text-on-surface-variant">
                GRADE 2
              </p>
              <p className="font-data-mono text-sm text-[#F59E0B] tabular-nums">
                20%
              </p>
            </div>
            <div className="text-center">
              <p className="font-label-caps text-[10px] text-on-surface-variant">
                REJECTS
              </p>
              <p className="font-data-mono text-sm text-[#EF4444] tabular-nums">
                5%
              </p>
            </div>
          </div>
        </div>

        {/* 4. System Uptime Score (Radial Gauge) */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col hover:border-primary transition-colors duration-300">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-md text-center">
            System Uptime Score
          </h3>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="relative w-48 h-24 overflow-hidden">
              <svg className="w-full h-full" viewBox="0 0 100 50">
                {/* Background Track */}
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="10"
                />
                {/* Progress — 99.9% */}
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="#06B6D4"
                  strokeDasharray="125 125"
                  strokeWidth="10"
                />
              </svg>
              <div className="absolute bottom-0 left-0 right-0 text-center">
                <span className="font-data-mono text-3xl text-primary tabular-nums">
                  99.9%
                </span>
              </div>
            </div>
            <div className="mt-lg grid grid-cols-2 gap-xl w-full">
              <div className="flex flex-col items-center border-r border-outline-variant">
                <span className="font-label-caps text-[10px] text-on-surface-variant">
                  TOTAL DOWNTIME
                </span>
                <span className="font-data-mono text-sm text-on-surface tabular-nums">
                  0h 04m
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="font-label-caps text-[10px] text-on-surface-variant">
                  NEXT SERVICE
                </span>
                <span className="font-data-mono text-sm text-on-surface tabular-nums">
                  14d 12h
                </span>
              </div>
            </div>
          </div>
          <div className="mt-auto pt-md text-center">
            <span className="font-label-caps text-[10px] py-1 px-3 bg-primary/10 border border-primary/20 rounded-full text-primary">
              OPTIMAL INDUSTRIAL LOAD
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="mt-lg bg-surface-container-low border border-outline-variant p-md rounded flex justify-between items-center">
        <div className="flex gap-lg">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-xs text-on-surface-variant">
              speed
            </span>
            <span className="font-label-caps text-[11px] text-on-surface-variant uppercase tracking-widest">
              Line Speed:{' '}
              <span className="text-on-surface">2.4m/s</span>
            </span>
          </div>
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-xs text-on-surface-variant">
              thermostat
            </span>
            <span className="font-label-caps text-[11px] text-on-surface-variant uppercase tracking-widest">
              Ambient:{' '}
              <span className="text-on-surface">24.2°C</span>
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="font-label-caps text-[10px] text-outline">
            UPDATED: 2023-10-27 14:42:01 UTC+8
          </span>
        </div>
      </div>
    </div>
  );
}
