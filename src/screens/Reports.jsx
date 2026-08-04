import { useState } from 'react';
import { SEED_RECENT_EXPORTS } from '../data/mockData';
import { downloadCsv } from '../utils/nodeRedApi';

/**
 * Reports & Documentation screen — route: /reports
 * Reference: stitch_bukidnon_pineapple_operations_hub/reports_data_export/code.html
 *
 * Per BUILD_SPEC.md Screen: Reports & Documentation.
 * 3 report generator cards + recent export history table + footer status strip.
 *
 * @param {{ mqtt: object }} props
 */
export default function Reports({ mqtt }) {
  const [generating, setGenerating] = useState(null);

  function handleGenerate(reportName) {
    setGenerating(reportName);
    setTimeout(() => setGenerating(null), 4500);
  }

  async function handleExportCsv() {
    try {
      await downloadCsv('weights');
    } catch {
      // If Node-RED is unreachable, CSV download will fail silently
      console.warn('CSV export failed — Node-RED may be offline.');
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <section className="mb-xl flex justify-between items-end">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">
            Reports &amp; Documentation
          </h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
            Standardized operational reporting for export-grade compliance and
            facility throughput monitoring.
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <div className="flex items-center gap-xs px-sm py-1 bg-primary/10 border border-primary/20 rounded">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="font-label-caps text-[10px] text-primary">
              System Online
            </span>
          </div>
        </div>
      </section>

      {/* Report Generator Cards (3 cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
        {/* Card 1: Daily Audit Summary */}
        <article className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col justify-between group hover:border-primary/50 transition-all duration-300">
          <div>
            <div className="flex justify-between items-start mb-md">
              <div className="p-sm bg-surface-variant rounded">
                <span className="material-symbols-outlined text-primary">
                  description
                </span>
              </div>
              <span className="font-label-caps text-[10px] text-on-surface-variant bg-surface-container-high px-sm py-0.5 rounded">
                PDF ONLY
              </span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-sm">
              Daily Audit Summary
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant mb-xl leading-relaxed">
              Complete daily grading audit with batch traceability and QA
              sign-off.
            </p>
          </div>
          <div className="space-y-md">
            <div>
              <label className="font-label-caps text-[10px] text-on-surface-variant block mb-xs">
                DATE RANGE
              </label>
              <div className="flex items-center gap-sm bg-surface-container-high border border-outline-variant rounded px-sm py-xs h-10">
                <span className="material-symbols-outlined text-xs text-on-surface-variant">
                  calendar_today
                </span>
                <input
                  className="bg-transparent border-none p-0 text-on-surface font-data-mono text-sm focus:ring-0 w-full"
                  type="date"
                  defaultValue="2024-05-24"
                />
              </div>
            </div>
            <div className="flex flex-col gap-sm">
              <button
                onClick={() => handleGenerate('Daily Audit Summary')}
                disabled={generating !== null}
                className={`w-full font-label-caps py-sm flex items-center justify-center gap-sm rounded transition-all ${
                  generating === 'Daily Audit Summary'
                    ? 'bg-[#10B981] text-white'
                    : 'bg-primary text-on-primary hover:brightness-110'
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {generating === 'Daily Audit Summary'
                    ? 'sync'
                    : 'article'}
                </span>
                {generating === 'Daily Audit Summary'
                  ? 'PROCESSING...'
                  : 'Generate Report'}
              </button>
              <button
                onClick={handleExportCsv}
                className="w-full border border-outline-variant text-on-surface font-label-caps py-sm rounded hover:bg-surface-variant transition-all"
              >
                Export CSV
              </button>
            </div>
          </div>
        </article>

        {/* Card 2: Grade Quality Export */}
        <article className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col justify-between group hover:border-primary/50 transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-lg opacity-10 group-hover:opacity-20 transition-opacity">
            <span
              className="material-symbols-outlined leading-none"
              style={{ fontSize: '160px' }}
            >
              verified
            </span>
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-md">
              <div className="p-sm bg-surface-variant rounded">
                <span className="material-symbols-outlined text-primary">
                  verified
                </span>
              </div>
              <span className="font-label-caps text-[10px] text-primary bg-primary/10 px-sm py-0.5 rounded border border-primary/20">
                MOST USED
              </span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-sm">
              Grade Quality Export
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant mb-xl leading-relaxed">
              Export grade distribution data with statistical process control
              metrics.
            </p>
          </div>
          <div className="space-y-md relative z-10">
            <div>
              <label className="font-label-caps text-[10px] text-on-surface-variant block mb-xs">
                DATE RANGE
              </label>
              <div className="flex items-center gap-sm bg-surface-container-high border border-outline-variant rounded px-sm py-xs h-10">
                <span className="material-symbols-outlined text-xs text-on-surface-variant">
                  date_range
                </span>
                <div className="flex items-center gap-xs w-full">
                  <input
                    className="bg-transparent border-none p-0 text-on-surface font-data-mono text-[12px] focus:ring-0 w-full"
                    type="date"
                    defaultValue="2024-05-01"
                  />
                  <span className="text-on-surface-variant">→</span>
                  <input
                    className="bg-transparent border-none p-0 text-on-surface font-data-mono text-[12px] focus:ring-0 w-full"
                    type="date"
                    defaultValue="2024-05-24"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-sm">
              <button
                onClick={() => handleGenerate('Grade Quality Export')}
                disabled={generating !== null}
                className={`w-full font-label-caps py-sm flex items-center justify-center gap-sm rounded transition-all ${
                  generating === 'Grade Quality Export'
                    ? 'bg-[#10B981] text-white'
                    : 'bg-primary text-on-primary hover:brightness-110'
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {generating === 'Grade Quality Export'
                    ? 'sync'
                    : 'article'}
                </span>
                {generating === 'Grade Quality Export'
                  ? 'PROCESSING...'
                  : 'Generate Report'}
              </button>
              <button
                onClick={handleExportCsv}
                className="w-full border border-outline-variant text-on-surface font-label-caps py-sm rounded hover:bg-surface-variant transition-all"
              >
                Export CSV
              </button>
            </div>
          </div>
        </article>

        {/* Card 3: Device Downtime Log */}
        <article className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col justify-between group hover:border-primary/50 transition-all duration-300">
          <div>
            <div className="flex justify-between items-start mb-md">
              <div className="p-sm bg-surface-variant rounded">
                <span className="material-symbols-outlined text-tertiary">
                  warning
                </span>
              </div>
              <span className="font-label-caps text-[10px] text-tertiary bg-tertiary/10 px-sm py-0.5 rounded border border-tertiary/20">
                MAINTENANCE
              </span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-sm">
              Device Downtime Log
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant mb-xl leading-relaxed">
              Scheduled and unscheduled downtime tracking with
              mean-time-between-failure calculations.
            </p>
          </div>
          <div className="space-y-md">
            <div>
              <label className="font-label-caps text-[10px] text-on-surface-variant block mb-xs">
                DATE RANGE
              </label>
              <div className="flex items-center gap-sm bg-surface-container-high border border-outline-variant rounded px-sm py-xs h-10">
                <span className="material-symbols-outlined text-xs text-on-surface-variant">
                  history
                </span>
                <select className="bg-transparent border-none p-0 text-on-surface font-data-mono text-sm focus:ring-0 w-full appearance-none">
                  <option>Last 7 Days</option>
                  <option>Last 30 Days</option>
                  <option>Current Shift</option>
                  <option>Custom Range</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-sm">
              <button
                onClick={() => handleGenerate('Device Downtime Log')}
                disabled={generating !== null}
                className={`w-full font-label-caps py-sm flex items-center justify-center gap-sm rounded transition-all ${
                  generating === 'Device Downtime Log'
                    ? 'bg-[#10B981] text-white'
                    : 'bg-primary text-on-primary hover:brightness-110'
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {generating === 'Device Downtime Log'
                    ? 'sync'
                    : 'article'}
                </span>
                {generating === 'Device Downtime Log'
                  ? 'PROCESSING...'
                  : 'Generate Report'}
              </button>
              <button
                onClick={handleExportCsv}
                className="w-full border border-outline-variant text-on-surface font-label-caps py-sm rounded hover:bg-surface-variant transition-all"
              >
                Export CSV
              </button>
            </div>
          </div>
        </article>
      </div>

      {/* Recent Export History Table */}
      <section className="mt-xl">
        <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-md tracking-widest">
          RECENT EXPORT HISTORY
        </h3>
        <div className="bg-surface-container border border-outline-variant rounded overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-surface-container-high border-b border-outline-variant">
              <tr>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant">
                  File Name
                </th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant">
                  Generated By
                </th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant">
                  Date
                </th>
                <th className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant text-right">
                  Download
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {SEED_RECENT_EXPORTS.map((row, i) => (
                <tr
                  key={i}
                  className="hover:bg-surface-container-high transition-colors group"
                >
                  <td className="px-md py-sm">
                    <div className="flex items-center gap-sm">
                      <span
                        className="material-symbols-outlined text-sm"
                        style={{
                          color:
                            row.type === 'pdf' ? '#EF4444' : '#10B981',
                        }}
                      >
                        {row.type === 'pdf'
                          ? 'picture_as_pdf'
                          : 'description'}
                      </span>
                      <span className="font-data-mono text-data-mono text-primary tabular-nums">
                        {row.filename}
                      </span>
                    </div>
                  </td>
                  <td className="px-md py-sm font-data-mono text-data-mono text-on-surface-variant">
                    {row.generatedBy}
                  </td>
                  <td className="px-md py-sm font-data-mono text-data-mono text-on-surface-variant tabular-nums">
                    {row.date}
                  </td>
                  <td className="px-md py-sm text-right">
                    <button className="inline-flex items-center gap-xs px-md py-1.5 border border-outline-variant rounded text-on-surface-variant hover:text-primary hover:border-primary transition-all font-label-caps text-[11px] uppercase">
                      <span className="material-symbols-outlined text-[16px]">
                        download
                      </span>
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-md flex justify-center border-t border-outline-variant">
            <button className="font-label-caps text-[10px] text-on-surface-variant hover:text-primary transition-colors">
              VIEW FULL AUDIT LOG
            </button>
          </div>
        </div>
      </section>

      {/* Footer Status Strip */}
      <footer className="mt-lg bg-surface-container-low border border-outline-variant p-md rounded flex justify-between items-center">
        <div className="flex items-center gap-xl">
          <div className="flex items-center gap-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            <span className="font-data-mono text-[10px] text-on-surface-variant">
              Storage: 2.4 GB / 10 GB (24%)
            </span>
          </div>
          {/* Storage progress bar */}
          <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden w-24">
            <div
              className="h-full bg-primary"
              style={{ width: '24%' }}
            />
          </div>
        </div>
        <div className="flex items-center gap-md">
          <div className="flex items-center gap-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            <span className="font-data-mono text-[10px] text-on-surface-variant">
              Last Sync: 2 min ago • All systems operational
            </span>
          </div>
          <div className="h-3 w-px bg-outline-variant" />
          <span className="font-data-mono text-[10px] text-on-surface-variant">
            © 2024 Bukidnon Fresh Pineapple Corp. • Node ID: BFPC-04-B
          </span>
        </div>
      </footer>
    </div>
  );
}
