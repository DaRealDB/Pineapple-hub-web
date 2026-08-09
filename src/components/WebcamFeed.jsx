/**
 * Displays the live webcam frame from WebSocket frame data or MJPEG stream.
 *
 * @param {{ frameData?: string | null, isRunning: boolean, connectionState?: string }} props
 */
export default function WebcamFeed({ frameData, isRunning, connectionState }) {
  // ── WebSocket still connecting ──
  if (connectionState === 'connecting') {
    return (
      <div className="aspect-video bg-surface-container-low rounded flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-tertiary mb-sm block animate-spin">
            sync
          </span>
          <p className="font-body-md text-body-md text-tertiary">
            Connecting to OCR pipeline...
          </p>
          <p className="font-data-mono text-[10px] text-on-surface-variant/50 mt-xs">
            Check that the OCR backend is running on :8000
          </p>
        </div>
      </div>
    );
  }

  // ── WebSocket error ──
  if (connectionState === 'error') {
    return (
      <div className="aspect-video bg-surface-container-low rounded flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-[#EF4444] mb-sm block">
            cloud_off
          </span>
          <p className="font-body-md text-body-md text-[#EF4444]">
            Connection failed
          </p>
          <p className="font-data-mono text-[10px] text-on-surface-variant/50 mt-xs">
            OCR backend unreachable — check terminal
          </p>
        </div>
      </div>
    );
  }

  // ── Not running ──
  if (!isRunning) {
    return (
      <div className="aspect-video bg-surface-container-low rounded flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-sm block">
            videocam_off
          </span>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Webcam offline
          </p>
          <p className="font-data-mono text-[10px] text-on-surface-variant/50 mt-xs">
            Click Start or reload the page to auto-start
          </p>
        </div>
      </div>
    );
  }

  // ── Running but no frame yet ──
  if (!frameData) {
    return (
      <div className="aspect-video bg-surface-container-low rounded flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-sm block animate-pulse">
            hourglass_top
          </span>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Waiting for frame...
          </p>
        </div>
      </div>
    );
  }

  // ── Live frame ──
  return (
    <div className="aspect-video bg-surface-container-low rounded flex items-center justify-center overflow-hidden">
      <img
        src={`data:image/jpeg;base64,${frameData}`}
        alt="Live OCR pipeline feed"
        className="w-full h-full object-cover"
      />
    </div>
  );
}
