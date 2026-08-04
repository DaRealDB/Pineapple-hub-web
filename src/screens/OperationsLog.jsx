import { useState } from 'react';
import StatusPill from '../components/StatusPill';

/**
 * Operations Log screen — route: /operations-log
 *
 * Shows historical crate grading events from Node-RED SQLite.
 * Currently shows empty state — requires the Node-RED HTTP endpoint
 * to be configured and serving data.
 *
 * @param {{ mqtt: object }} props
 */
export default function OperationsLog({ mqtt }) {
  const { connectionState } = mqtt;
  const isLive = connectionState === 'connected';
  const [selectedRow, setSelectedRow] = useState(null);

  return (
    <div className="h-full flex flex-col">
      {/* Filter Bar */}
      <section className="p-lg bg-surface-container-low/50 border-b border-outline-variant mb-lg rounded">
        <div className="flex flex-wrap items-end gap-md">
          <div className="flex flex-col gap-xs">
            <label className="font-label-caps text-[10px] text-on-surface-variant">
              DATE RANGE
            </label>
            <div className="flex items-center bg-surface-container-high border border-outline-variant rounded px-sm py-xs h-10 w-48">
              <span className="material-symbols-outlined text-sm mr-xs">calendar_today</span>
              <select className="bg-transparent border-none focus:ring-0 text-body-md w-full appearance-none cursor-pointer text-on-surface">
                <option>Last 7 Days</option>
                <option>Today</option>
                <option>Last 24 Hours</option>
                <option>Custom Range</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-xs flex-1">
            <label className="font-label-caps text-[10px] text-on-surface-variant">
              BATCH ID SEARCH
            </label>
            <div className="flex items-center bg-surface-container-high border border-outline-variant rounded px-sm py-xs h-10 focus-within:border-primary transition-colors">
              <span className="material-symbols-outlined text-sm mr-xs">search</span>
              <input
                className="bg-transparent border-none focus:ring-0 text-body-md w-full text-on-surface placeholder-on-surface-variant"
                placeholder="Enter Batch ID (e.g. PN-2024-B102)..."
                type="text"
              />
            </div>
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-label-caps text-[10px] text-on-surface-variant">
              FILTER GRADE
            </label>
            <div className="flex items-center bg-surface-container-high border border-outline-variant rounded px-sm py-xs h-10 w-40">
              <span className="material-symbols-outlined text-sm mr-xs">filter_list</span>
              <select className="bg-transparent border-none focus:ring-0 text-body-md w-full appearance-none cursor-pointer text-on-surface">
                <option>All Grades</option>
              </select>
            </div>
          </div>

          <button className="bg-primary text-on-primary h-10 px-lg rounded font-bold font-label-caps flex items-center gap-xs hover:bg-primary/90 transition-all active:scale-[0.98]">
            <span className="material-symbols-outlined text-sm">download</span>
            EXPORT LOG
          </button>
        </div>
      </section>

      {/* Data Table */}
      <section className="flex-1 overflow-auto">
        <div className="bg-surface-container border border-outline-variant rounded-lg overflow-hidden flex flex-col h-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-highest border-b border-outline-variant">
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Timestamp</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Batch ID</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Scale ID</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Crate Weight (kg)</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Grade</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Audit Status</th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="7" className="px-md py-xl text-center">
                  <div className="flex flex-col items-center gap-sm">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant/30">
                      {isLive ? 'hourglass_top' : 'cloud_off'}
                    </span>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      {isLive
                        ? 'No log entries yet. Crate events will appear here as they are processed.'
                        : 'Operations log unavailable — MQTT broker is offline.'}
                    </p>
                    <p className="font-data-mono text-xs text-on-surface-variant/50">
                      Requires Node-RED SQLite endpoint at {import.meta.env.VITE_NODE_RED_BASE_URL || 'http://localhost:1880'}
                    </p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Pagination Footer */}
          <div className="mt-auto bg-surface-container-low border-t border-outline-variant p-md flex items-center justify-between">
            <span className="font-body-md text-on-surface-variant">
              No entries
            </span>
            <div className="flex items-center gap-sm">
              <button disabled className="p-xs bg-surface-container-high border border-outline-variant rounded opacity-30">
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <button className="w-8 h-8 flex items-center justify-center bg-primary text-on-primary font-bold rounded">1</button>
              <button disabled className="p-xs bg-surface-container-high border border-outline-variant rounded opacity-30">
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Floating Action Button */}
      <button className="fixed bottom-lg right-lg w-14 h-14 bg-primary text-on-primary rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50">
        <span className="material-symbols-outlined text-3xl">add_notes</span>
      </button>
    </div>
  );
}
