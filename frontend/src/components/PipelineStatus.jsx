export default function PipelineStatus({ status }) {
  if (!status) {
    return (
      <div className="text-center py-md">
        <p className="font-body-md text-body-md text-on-surface-variant">
          Pipeline status not available
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-sm">
      <div className="bg-surface-container-low p-sm rounded">
        <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
          FPS
        </p>
        <p className="font-headline-sm text-headline-sm font-bold text-primary">
          {status.fps?.toFixed(1) || 'N/A'}
        </p>
      </div>
      <div className="bg-surface-container-low p-sm rounded">
        <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
          Processing Time
        </p>
        <p className="font-headline-sm text-headline-sm font-bold text-on-surface">
          {status.avg_processing_time_ms?.toFixed(0) || 'N/A'}ms
        </p>
      </div>
      <div className="bg-surface-container-low p-sm rounded">
        <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
          Total Processed
        </p>
        <p className="font-headline-sm text-headline-sm font-bold text-on-surface">
          {status.total_processed || 0}
        </p>
      </div>
      <div className="bg-surface-container-low p-sm rounded">
        <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
          Duplicates
        </p>
        <p className="font-headline-sm text-headline-sm font-bold text-tertiary">
          {status.duplicates || 0}
        </p>
      </div>
    </div>
  );
}