export default function OCRResults({ results }) {
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  };

  return (
    <div className="space-y-sm max-h-96 overflow-y-auto scrollbar-industrial">
      {results.length > 0 ? (
        results.map((result, index) => (
          <div
            key={index}
            className={`bg-surface-container-low p-sm rounded border-l-4 ${
              result.is_duplicate ? 'border-tertiary' : 'border-primary'
            }`}
          >
            <div className="flex justify-between items-start mb-xs">
              <p className="font-body-md text-body-md text-on-surface flex-1">
                {result.text || 'No text detected'}
              </p>
              <span className="font-data-mono text-data-mono text-primary ml-sm">
                {(result.confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="font-label-caps text-label-caps text-on-surface-variant">
                {result.processing_time_ms}ms
              </span>
              <span className="font-data-mono text-data-mono text-on-surface-variant">
                {formatTimestamp(result.created_at)}
              </span>
            </div>
            {result.is_duplicate && (
              <div className="mt-xs">
                <span className="font-label-caps text-label-caps text-tertiary">
                  Duplicate ({(result.similarity_score * 100).toFixed(0)}%)
                </span>
              </div>
            )}
          </div>
        ))
      ) : (
        <div className="text-center py-lg">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant">
            search_off
          </span>
          <p className="font-body-md text-body-md text-on-surface-variant mt-sm">
            No OCR results yet
          </p>
          <p className="font-body-md text-body-md text-on-surface-variant text-sm">
            Upload an image or start the pipeline to begin processing
          </p>
        </div>
      )}
    </div>
  );
}