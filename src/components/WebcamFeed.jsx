/**
 * Displays the live webcam frame from WebSocket frame data or MJPEG stream.
 *
 * @param {{ frameData?: string | null, isRunning: boolean }} props
 */
export default function WebcamFeed({ frameData, isRunning }) {
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
        </div>
      </div>
    );
  }

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
