export default function WebcamFeed({ frameData, isRunning }) {
  return (
    <div className="aspect-video bg-surface-container-low rounded flex items-center justify-center overflow-hidden">
      {frameData ? (
        <img
          src={`data:image/jpeg;base64,${frameData}`}
          alt="Webcam Feed"
          className="w-full h-full object-cover"
        />
      ) : isRunning ? (
        <div className="text-center">
          <span className="material-symbols-outlined text-6xl text-primary animate-pulse">
            videocam
          </span>
          <p className="font-body-md text-body-md text-on-surface-variant mt-sm">
            Loading feed...
          </p>
        </div>
      ) : (
        <div className="text-center">
          <span className="material-symbols-outlined text-6xl text-on-surface-variant">
            videocam_off
          </span>
          <p className="font-body-md text-body-md text-on-surface-variant mt-sm">
            Webcam not started
          </p>
        </div>
      )}
    </div>
  );
}