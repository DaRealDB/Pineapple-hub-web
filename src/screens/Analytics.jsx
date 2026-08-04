import StatusPill from '../components/StatusPill';

/**
 * Performance Analytics screen — route: /analytics
 *
 * Shows historical performance charts. All charts require a live data
 * source (Node-RED SQLite aggregation endpoint) which is not yet
 * configured. Until then, the screen shows the chart layout with
 * empty/placeholder states.
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
            {isLive ? (
              <>
                <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                <span className="font-label-caps text-label-caps text-[#10B981]">
                  SYSTEM ACTIVE
                </span>
              </>
            ) : (
              <StatusPill variant="offline" label="MQTT OFFLINE" />
            )}
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
        {/* 1. Avg Crate Weight Stability Trend */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col">
          <div className="flex justify-between items-start mb-md">
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-xs">
                Avg Crate Weight Stability Trend
              </h3>
              <span className="font-data-mono text-2xl text-on-surface-variant/30 tabular-nums">
                --.-kg
              </span>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">monitoring</span>
          </div>
          <EmptyChartPlaceholder />
        </div>

        {/* 2. Throughput by Grade */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col">
          <div className="flex justify-between items-start mb-md">
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-xs">
                Throughput by Grade (7 Days)
              </h3>
              <span className="font-data-mono text-2xl text-on-surface-variant/30 tabular-nums">
                -- Crates
              </span>
            </div>
          </div>
          <EmptyChartPlaceholder />
        </div>

        {/* 3. Overall Grade Distribution */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-md text-center">
            Overall Grade Distribution %
          </h3>
          <EmptyChartPlaceholder />
        </div>

        {/* 4. System Uptime Score */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-md text-center">
            System Uptime Score
          </h3>
          <EmptyChartPlaceholder />
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="mt-lg bg-surface-container-low border border-outline-variant p-md rounded flex justify-between items-center">
        <div className="flex gap-lg">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-xs text-on-surface-variant">speed</span>
            <span className="font-label-caps text-[11px] text-on-surface-variant uppercase tracking-widest">
              Line Speed: <span className="text-on-surface-variant/30">-- m/s</span>
            </span>
          </div>
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-xs text-on-surface-variant">thermostat</span>
            <span className="font-label-caps text-[11px] text-on-surface-variant uppercase tracking-widest">
              Ambient: <span className="text-on-surface-variant/30">--.-°C</span>
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="font-label-caps text-[10px] text-outline">
            No historical data available
          </span>
        </div>
      </div>
    </div>
  );
}

/** Placeholder for a chart widget awaiting data. */
function EmptyChartPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[200px] border border-outline-variant/30 rounded bg-surface-container-low/50">
      <div className="text-center">
        <span className="material-symbols-outlined text-3xl text-on-surface-variant/20 mb-sm block">
          bar_chart_4_bars
        </span>
        <p className="font-body-md text-body-md text-on-surface-variant/50">
          Awaiting historical data
        </p>
        <p className="font-data-mono text-[10px] text-on-surface-variant/30 mt-xs">
          Requires Node-RED aggregation endpoint
        </p>
      </div>
    </div>
  );
}
