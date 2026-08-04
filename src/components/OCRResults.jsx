/**
 * Displays the list of OCR results from the pipeline WebSocket stream.
 *
 * @param {{ results: Array<{
 *   text?: string,
 *   confidence?: number,
 *   created_at?: string,
 *   is_duplicate?: boolean,
 *   similarity_score?: number,
 * }> }} props
 */
export default function OCRResults({ results }) {
  if (!results || results.length === 0) {
    return (
      <div className="text-center py-lg">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-sm block">
          text_scan_note
        </span>
        <p className="font-body-md text-body-md text-on-surface-variant">
          No OCR results yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-xs max-h-96 overflow-y-auto scrollbar-industrial">
      {results.map((result, index) => (
        <div
          key={index}
          className={`bg-surface-container-low p-sm rounded border ${
            result.is_duplicate
              ? 'border-tertiary'
              : 'border-outline-variant'
          }`}
        >
          <div className="flex justify-between items-start gap-sm">
            <p className="font-body-md text-body-md text-on-surface flex-1 break-words">
              {result.text || 'No text detected'}
            </p>
            {result.is_duplicate && (
              <span className="material-symbols-outlined text-tertiary text-lg flex-shrink-0">
                content_copy
              </span>
            )}
          </div>

          <div className="flex justify-between items-center mt-xs">
            <div className="flex items-center gap-sm">
              <span className="font-data-mono text-data-mono text-primary">
                {result.confidence != null
                  ? `${(result.confidence * 100).toFixed(1)}%`
                  : 'N/A'}
              </span>
              {result.is_duplicate && result.similarity_score != null && (
                <span className="font-label-caps text-label-caps text-tertiary text-xs">
                  {(result.similarity_score * 100).toFixed(0)}% similar
                </span>
              )}
            </div>
            <span className="font-data-mono text-data-mono text-on-surface-variant text-xs">
              {result.created_at
                ? new Date(result.created_at).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })
                : '—'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
