/**
 * Displays live pipeline health and performance metrics.
 *
 * @param {{ status?: {
 *   fps?: number,
 *   processing_time_ms?: number,
 *   ocr_count?: number,
 *   error_count?: number,
 *   uptime_seconds?: number,
 *   pipeline_state?: string,
 * } | null }} props
 */
export default function PipelineStatus({ status }) {
  if (!status) {
    return (
      <div className="text-center py-md">
        <span className="material-symbols-outlined text-3xl text-on-surface-variant mb-sm block">
          info
        </span>
        <p className="font-body-md text-body-md text-on-surface-variant">
          No pipeline status available
        </p>
      </div>
    );
  }

  const metrics = [
    {
      icon: 'speed',
      label: 'FPS',
      value: status.fps != null ? status.fps.toFixed(1) : '—',
      color: status.fps != null && status.fps >= 15 ? 'text-[#10B981]' : 'text-tertiary',
    },
    {
      icon: 'timer',
      label: 'Processing Time',
      value: status.processing_time_ms != null
        ? `${status.processing_time_ms.toFixed(0)}ms`
        : '—',
      color: 'text-primary',
    },
    {
      icon: 'text_fields',
      label: 'OCR Count',
      value: status.ocr_count != null ? String(status.ocr_count) : '—',
      color: 'text-on-surface',
    },
    {
      icon: 'error',
      label: 'Errors',
      value: status.error_count != null ? String(status.error_count) : '—',
      color: status.error_count != null && status.error_count > 0
        ? 'text-[#EF4444]'
        : 'text-on-surface',
    },
    {
      icon: 'schedule',
      label: 'Uptime',
      value: status.uptime_seconds != null
        ? formatUptime(status.uptime_seconds)
        : '—',
      color: 'text-on-surface',
    },
  ];

  return (
    <div className="space-y-sm">
      {/* State indicator */}
      <div className="flex items-center gap-sm mb-sm">
        <span
          className={`w-2 h-2 rounded-full ${
            status.pipeline_state === 'running'
              ? 'bg-[#10B981] animate-pulse'
              : status.pipeline_state === 'error'
                ? 'bg-[#EF4444]'
                : 'bg-on-surface-variant'
          }`}
        />
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
          {status.pipeline_state || 'Unknown'}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-sm">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="bg-surface-container-low p-sm rounded"
          >
            <div className="flex items-center gap-xs mb-xs">
              <span className={`material-symbols-outlined text-sm ${metric.color}`}>
                {metric.icon}
              </span>
              <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                {metric.label}
              </p>
            </div>
            <p className={`font-data-mono text-data-mono ${metric.color} pl-6`}>
              {metric.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Format seconds into a human-readable uptime string.
 */
function formatUptime(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
