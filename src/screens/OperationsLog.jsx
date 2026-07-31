import { useState } from 'react';
import StatusPill from '../components/StatusPill';
import { SEED_OPERATIONS_LOG } from '../data/mockData';

/**
 * Operations Log screen — route: /operations-log
 * Reference: stitch_bukidnon_pineapple_operations_hub/operations_log_history/code.html
 *
 * Per BUILD_SPEC.md Screen: Operations Log.
 * Filter bar + data table with grade/audit pills + pagination + FAB.
 *
 * @param {{ mqtt: object }} props
 */
export default function OperationsLog({ mqtt }) {
  const [selectedRow, setSelectedRow] = useState(null);

  const gradeVariantMap = {
    'grade-a': 'grade-a',
    'grade-b': 'grade-b',
    rejected: 'rejected',
  };

  const gradeLabelMap = {
    'grade-a': 'Grade A',
    'grade-b': 'Grade B',
    rejected: 'Rejected',
  };

  const auditIconMap = {
    verified: { icon: 'verified', color: '#10B981' },
    flagged: { icon: 'warning', color: '#EF4444' },
    pending: { icon: 'pending', color: '#ffb873' },
  };

  const auditLabelMap = {
    verified: 'Verified',
    flagged: 'Flagged',
    pending: 'Pending',
  };

  return (
    <div className="h-full flex flex-col">
      {/* Filter Bar */}
      <section className="p-lg bg-surface-container-low/50 border-b border-outline-variant mb-lg rounded">
        <div className="flex flex-wrap items-end gap-md">
          {/* Date Range */}
          <div className="flex flex-col gap-xs">
            <label className="font-label-caps text-[10px] text-on-surface-variant">
              DATE RANGE
            </label>
            <div className="flex items-center bg-surface-container-high border border-outline-variant rounded px-sm py-xs h-10 w-48">
              <span className="material-symbols-outlined text-sm mr-xs">
                calendar_today
              </span>
              <select className="bg-transparent border-none focus:ring-0 text-body-md w-full appearance-none cursor-pointer text-on-surface">
                <option>Last 7 Days</option>
                <option>Today</option>
                <option>Last 24 Hours</option>
                <option>Custom Range</option>
              </select>
            </div>
          </div>

          {/* Batch ID Search */}
          <div className="flex flex-col gap-xs flex-1">
            <label className="font-label-caps text-[10px] text-on-surface-variant">
              BATCH ID SEARCH
            </label>
            <div className="flex items-center bg-surface-container-high border border-outline-variant rounded px-sm py-xs h-10 focus-within:border-primary transition-colors">
              <span className="material-symbols-outlined text-sm mr-xs">
                search
              </span>
              <input
                className="bg-transparent border-none focus:ring-0 text-body-md w-full text-on-surface placeholder-on-surface-variant"
                placeholder="Enter Batch ID (e.g. PN-2024-B102)..."
                type="text"
              />
            </div>
          </div>

          {/* Filter Grade */}
          <div className="flex flex-col gap-xs">
            <label className="font-label-caps text-[10px] text-on-surface-variant">
              FILTER GRADE
            </label>
            <div className="flex items-center bg-surface-container-high border border-outline-variant rounded px-sm py-xs h-10 w-40">
              <span className="material-symbols-outlined text-sm mr-xs">
                filter_list
              </span>
              <select className="bg-transparent border-none focus:ring-0 text-body-md w-full appearance-none cursor-pointer text-on-surface">
                <option>All Grades</option>
                <option>G1 - Premium</option>
                <option>G2 - Choice</option>
                <option>Reject</option>
              </select>
            </div>
          </div>

          {/* Export Button */}
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
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">
                  Timestamp
                </th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">
                  Batch ID
                </th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">
                  Scale ID
                </th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">
                  Raw Weight (kg)
                </th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">
                  Grade (Status)
                </th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">
                  Audit Status
                </th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant whitespace-nowrap">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="font-data-mono text-data-mono divide-y divide-outline-variant">
              {SEED_OPERATIONS_LOG.map((row, i) => {
                const isRejected = row.grade === 'rejected';
                const isSelected = selectedRow === i;
                const audit = auditIconMap[row.audit];

                return (
                  <tr
                    key={i}
                    onClick={() => setSelectedRow(i)}
                    className={`transition-colors group cursor-pointer ${
                      isRejected
                        ? 'bg-error-container/5 hover:bg-error-container/10'
                        : `hover:bg-surface-container-high ${isSelected ? 'bg-primary/5' : ''}`
                    }`}
                  >
                    <td className="px-md py-sm tabular-nums text-on-surface-variant">
                      {row.ts}
                    </td>
                    <td
                      className={`px-md py-sm font-bold tabular-nums ${
                        isRejected ? 'text-error' : 'text-primary'
                      }`}
                    >
                      {row.batchId}
                    </td>
                    <td className="px-md py-sm tabular-nums">{row.scaleId}</td>
                    <td className="px-md py-sm tabular-nums">
                      {row.weightKg.toFixed(3)}
                    </td>
                    <td className="px-md py-sm">
                      <StatusPill
                        variant={gradeVariantMap[row.grade]}
                        label={gradeLabelMap[row.grade]}
                      />
                    </td>
                    <td className="px-md py-sm">
                      <div className="flex items-center gap-xs">
                        <span
                          className="material-symbols-outlined text-sm"
                          style={{ color: audit.color }}
                        >
                          {audit.icon}
                        </span>
                        <span className="text-on-surface">
                          {auditLabelMap[row.audit]}
                        </span>
                      </div>
                    </td>
                    <td className="px-md py-sm">
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-on-surface">
                        <span className="material-symbols-outlined">
                          more_vert
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination Footer */}
          <div className="mt-auto bg-surface-container-low border-t border-outline-variant p-md flex items-center justify-between">
            <span className="font-body-md text-on-surface-variant">
              Showing 1 to 7 of 1,284 events
            </span>
            <div className="flex items-center gap-sm">
              <button
                disabled
                className="p-xs bg-surface-container-high border border-outline-variant rounded hover:border-primary transition-colors disabled:opacity-30"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <div className="flex items-center gap-xs">
                <button className="w-8 h-8 flex items-center justify-center bg-primary text-on-primary font-bold rounded">
                  1
                </button>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-surface-container-high rounded transition-colors text-on-surface-variant">
                  2
                </button>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-surface-container-high rounded transition-colors text-on-surface-variant">
                  3
                </button>
                <span className="text-on-surface-variant">...</span>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-surface-container-high rounded transition-colors text-on-surface-variant">
                  184
                </button>
              </div>
              <button className="p-xs bg-surface-container-high border border-outline-variant rounded hover:border-primary transition-colors">
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
