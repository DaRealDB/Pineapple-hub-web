import { useState, useEffect, useRef, useCallback } from 'react';
import useWebSocket from '../hooks/useWebSocket';
import WebcamFeed from '../components/WebcamFeed';
import OCRResults from '../components/OCRResults';
import PipelineStatus from '../components/PipelineStatus';

const API_BASE = import.meta.env.VITE_OCR_API_URL || 'http://localhost:8000';

export default function OCRPipeline() {
  const {
    connectionState,
    ocrResults,
    pipelineStatus,
    webcamFrame: wsWebcamFrame,
  } = useWebSocket();

  // ── state ──────────────────────────────────────────────────────
  const [isWebcamRunning, setIsWebcamRunning] = useState(false);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [webcamFrame, setWebcamFrame] = useState(null);
  const [ipCameraUrl, setIpCameraUrl] = useState('');
  const [useIpCamera, setUseIpCamera] = useState(false);
  const [error, setError] = useState(null);

  // image-upload OCR (separate from pipeline)
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedImageData, setUploadedImageData] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrError, setOcrError] = useState(null);

  // track whether component is mounted to avoid state updates after unmount
  const mountedRef = useRef(true);

  // ── auto-start webcam + pipeline on mount ──────────────────────
  useEffect(() => {
    mountedRef.current = true;

    const autoStart = async () => {
      try {
        setError(null);

        // 1) start webcam
        const wcConfig = useIpCamera
          ? { ip_camera_url: ipCameraUrl }
          : { device_index: 0 };

        const wcRes = await fetch(`${API_BASE}/api/webcam/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wcConfig),
        });
        // 200 or 400 (already running) both mean the webcam is on
        if (!wcRes.ok && wcRes.status !== 400) {
          throw new Error(`Webcam start failed: ${wcRes.status}`);
        }
        if (!mountedRef.current) return;
        setIsWebcamRunning(true);

        // 2) start pipeline (400 = already running, which is fine)
        const ppRes = await fetch(`${API_BASE}/api/pipeline/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!ppRes.ok && ppRes.status !== 400) {
          throw new Error(`Pipeline start failed: ${ppRes.status}`);
        }
        if (!mountedRef.current) return;
        setIsPipelineRunning(true);

        console.log('[OCRPipeline] Auto-started webcam + pipeline');
      } catch (e) {
        console.error('[OCRPipeline] Auto-start error:', e);
        if (mountedRef.current) setError(e.message);
      }
    };

    autoStart();

    // ── cleanup on unmount ──────────────────────────────────
    return () => {
      mountedRef.current = false;
      // Stop pipeline first, then webcam
      fetch(`${API_BASE}/api/pipeline/stop`, { method: 'POST' }).catch(() => {});
      fetch(`${API_BASE}/api/webcam/stop`, { method: 'POST' }).catch(() => {});
      console.log('[OCRPipeline] Cleaned up webcam + pipeline');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── sync WebSocket frame for pipeline live view ─────────────────
  useEffect(() => {
    if (isPipelineRunning && wsWebcamFrame) {
      setWebcamFrame(wsWebcamFrame.frame_data);
    }
  }, [isPipelineRunning, wsWebcamFrame]);

  // ── manual stop (if user wants to shut down) ───────────────────
  const handleStop = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/pipeline/stop`, { method: 'POST' });
      setIsPipelineRunning(false);
    } catch (e) {
      console.error('[OCRPipeline] Stop pipeline error:', e);
    }
    try {
      await fetch(`${API_BASE}/api/webcam/stop`, { method: 'POST' });
      setIsWebcamRunning(false);
      setWebcamFrame(null);
    } catch (e) {
      console.error('[OCRPipeline] Stop webcam error:', e);
    }
  }, []);

  // ── manual restart ────────────────────────────────────────────
  const handleRestart = useCallback(async () => {
    // Stop everything first
    await fetch(`${API_BASE}/api/pipeline/stop`, { method: 'POST' }).catch(() => {});
    await fetch(`${API_BASE}/api/webcam/stop`, { method: 'POST' }).catch(() => {});

    setIsWebcamRunning(false);
    setIsPipelineRunning(false);
    setWebcamFrame(null);
    setError(null);

    // Small delay to let hardware release
    await new Promise((r) => setTimeout(r, 500));

    // Restart
    try {
      const wcConfig = useIpCamera
        ? { ip_camera_url: ipCameraUrl }
        : { device_index: 0 };

      await fetch(`${API_BASE}/api/webcam/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wcConfig),
      });
      setIsWebcamRunning(true);

      await fetch(`${API_BASE}/api/pipeline/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setIsPipelineRunning(true);
    } catch (e) {
      console.error('[OCRPipeline] Restart error:', e);
      setError(e.message);
    }
  }, [useIpCamera, ipCameraUrl]);

  // ── image-upload OCR handlers ──────────────────────────────────
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result);
        setUploadedImageData(reader.result);
        setOcrResult(null);
        setOcrError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImageOCR = async () => {
    if (!uploadedImageData) return;
    setIsProcessing(true);
    setOcrError(null);

    try {
      const response = await fetch(uploadedImageData);
      const blob = await response.blob();

      const base64Data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(blob);
      });

      const ocrResponse = await fetch(`${API_BASE}/api/ocr/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_data: base64Data }),
      });

      if (!ocrResponse.ok) {
        const errorText = await ocrResponse.text();
        throw new Error(`OCR failed: ${ocrResponse.status} - ${errorText}`);
      }

      const result = await ocrResponse.json();
      setOcrResult(result);
    } catch (err) {
      setOcrError(err.message);
      console.error('[OCRPipeline] Image OCR error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────
  return (
    <div className="p-lg">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-lg">
          <div>
            <h1 className="font-headline-md text-headline-md font-bold text-primary">
              OCR Pipeline
            </h1>
            <p className="font-label-caps text-label-caps text-on-surface-variant">
              Real-time text recognition — auto-started on page load
            </p>
          </div>
          <div className="flex items-center gap-sm">
            {/* Connection indicator */}
            <span
              className={`w-2 h-2 rounded-full ${
                connectionState === 'connected'
                  ? 'bg-[#10B981] animate-pulse'
                  : connectionState === 'connecting'
                    ? 'bg-tertiary animate-pulse'
                    : 'bg-[#EF4444]'
              }`}
            />
            <span className="font-label-caps text-label-caps text-on-surface-variant">
              {connectionState === 'connected'
                ? 'CONNECTED'
                : connectionState === 'connecting'
                  ? 'CONNECTING'
                  : 'DISCONNECTED'}
            </span>
            {/* Stop / Restart buttons */}
            {(isWebcamRunning || isPipelineRunning) && (
              <>
                <button
                  onClick={handleStop}
                  className="ml-sm bg-error text-on-error py-xs px-sm rounded font-label-caps text-label-caps hover:bg-error-container transition-colors"
                >
                  Stop
                </button>
                <button
                  onClick={handleRestart}
                  className="bg-primary text-on-primary py-xs px-sm rounded font-label-caps text-label-caps hover:bg-primary-container transition-colors"
                >
                  Restart
                </button>
              </>
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-error-container p-sm rounded mb-md">
            <p className="text-on-error-container font-body-md text-body-md">
              Error: {error}
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-lg">
          {/* Left Column — Webcam Feed & Image OCR */}
          <div className="col-span-2 space-y-lg">
            {/* Image Upload Section */}
            <div className="bg-surface-container p-md rounded border border-outline-variant">
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface mb-md">
                Image to Text OCR
              </h2>
              <div className="grid grid-cols-2 gap-md">
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="w-full text-sm text-on-surface-variant file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-on-primary hover:file:bg-primary-container"
                  />
                  {uploadedImage && (
                    <div className="mt-md">
                      <img
                        src={uploadedImage}
                        alt="Uploaded"
                        className="w-full h-auto rounded border border-outline-variant"
                      />
                      <button
                        onClick={processImageOCR}
                        disabled={isProcessing}
                        className="mt-md w-full bg-primary text-on-primary py-sm px-md rounded font-label-caps text-label-caps hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessing ? 'Processing...' : 'Process OCR'}
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  {ocrError && (
                    <div className="bg-error-container p-sm rounded mb-md">
                      <p className="text-on-error-container font-body-md text-body-md">
                        Error: {ocrError}
                      </p>
                    </div>
                  )}
                  {ocrResult ? (
                    <div className="space-y-sm">
                      <div>
                        <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
                          Detected Text
                        </p>
                        <p className="font-body-md text-body-md text-on-surface bg-surface-container-low p-sm rounded">
                          {ocrResult.text || 'No text detected'}
                        </p>
                      </div>
                      <div>
                        <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
                          Confidence
                        </p>
                        <p className="font-data-mono text-data-mono text-primary">
                          {ocrResult.confidence
                            ? `${(ocrResult.confidence * 100).toFixed(1)}%`
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
                          Processing Time
                        </p>
                        <p className="font-data-mono text-data-mono text-on-surface">
                          {ocrResult.processing_time_ms
                            ? `${ocrResult.processing_time_ms}ms`
                            : 'N/A'}
                        </p>
                      </div>
                      {ocrResult.is_duplicate && (
                        <div className="bg-tertiary-container p-sm rounded">
                          <p className="text-on-tertiary-container font-body-md text-body-md">
                            ⚠️ Duplicate detected (similarity:{' '}
                            {ocrResult.similarity_score?.toFixed(2)})
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      Upload an image and click "Process OCR" to see results
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Webcam Feed */}
            <div className="bg-surface-container p-md rounded border border-outline-variant">
              <div className="flex justify-between items-center mb-md">
                <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  {isPipelineRunning
                    ? 'Live OCR Pipeline'
                    : isWebcamRunning
                      ? 'Webcam Preview'
                      : 'Webcam Feed'}
                </h2>
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  {isPipelineRunning
                    ? 'Streaming via WebSocket'
                    : isWebcamRunning
                      ? 'MJPEG stream'
                      : 'Offline'}
                </span>
              </div>

              {/* IP Camera Toggle */}
              <div className="mb-md p-sm bg-surface-container-low rounded">
                <div className="flex items-center gap-sm mb-sm">
                  <input
                    type="checkbox"
                    id="ipCameraToggle"
                    checked={useIpCamera}
                    onChange={(e) => setUseIpCamera(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label
                    htmlFor="ipCameraToggle"
                    className="font-body-md text-body-md text-on-surface"
                  >
                    Use IP Camera (Phone)
                  </label>
                </div>
                {useIpCamera && (
                  <input
                    type="text"
                    placeholder="http://192.168.1.x:port/video"
                    value={ipCameraUrl}
                    onChange={(e) => setIpCameraUrl(e.target.value)}
                    className="w-full px-sm py-xs rounded border border-outline-variant bg-surface-container text-on-surface font-body-md text-body-md"
                  />
                )}
                <p className="font-body-md text-body-md text-on-surface-variant text-xs mt-xs">
                  Install IP Webcam app on your phone and enter the URL above
                </p>
              </div>

              {/* Show MJPEG stream when webcam is on but pipeline is off;
                  show WebSocket frames when pipeline is running */}
              {isWebcamRunning && !isPipelineRunning ? (
                <div className="aspect-video bg-surface-container-low rounded flex items-center justify-center overflow-hidden">
                  <img
                    src={`${API_BASE}/api/webcam/stream`}
                    alt="Live MJPEG stream"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <WebcamFeed
                  frameData={webcamFrame}
                  isRunning={isWebcamRunning || isPipelineRunning}
                />
              )}

              {/* Pipeline Performance */}
              {isPipelineRunning && pipelineStatus && (
                <div className="mt-sm p-sm bg-surface-container-low rounded">
                  <div className="flex items-center justify-between mb-xs">
                    <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                      Pipeline FPS
                    </span>
                    <span className="font-data-mono text-data-mono text-primary">
                      {pipelineStatus.fps?.toFixed(1) || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                      Processing Time
                    </span>
                    <span className="font-data-mono text-data-mono text-on-surface">
                      {pipelineStatus.processing_time_ms?.toFixed(0) || 'N/A'}
                      ms
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Pipeline Status */}
            <div className="bg-surface-container p-md rounded border border-outline-variant">
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface mb-md">
                Pipeline Status
              </h2>
              <PipelineStatus status={pipelineStatus} />
            </div>

            {/* OCR Results */}
            <div className="bg-surface-container p-md rounded border border-outline-variant">
              <div className="flex justify-between items-center mb-md">
                <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  Real-time OCR Results
                </h2>
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  {ocrResults.length} results
                </span>
              </div>
              <OCRResults results={ocrResults} />
            </div>
          </div>

          {/* Right Column — Stats */}
          <div className="space-y-lg">
            <div className="bg-surface-container p-md rounded border border-outline-variant">
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface mb-md">
                Dashboard
              </h2>
              <div className="space-y-sm">
                <div className="bg-surface-container-low p-sm rounded">
                  <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
                    Total OCR Results
                  </p>
                  <p className="font-headline-lg text-headline-lg font-bold text-primary">
                    {ocrResults.length}
                  </p>
                </div>
                <div className="bg-surface-container-low p-sm rounded">
                  <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
                    Pipeline
                  </p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {isPipelineRunning ? 'Running' : 'Stopped'}
                  </p>
                </div>
                <div className="bg-surface-container-low p-sm rounded">
                  <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
                    WebSocket
                  </p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {connectionState}
                  </p>
                </div>
              </div>
            </div>

            {/* Recent Results */}
            <div className="bg-surface-container p-md rounded border border-outline-variant">
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface mb-md">
                Recent Results
              </h2>
              <div className="space-y-xs max-h-96 overflow-y-auto scrollbar-industrial">
                {ocrResults.slice(0, 10).map((result, index) => (
                  <div
                    key={index}
                    className="bg-surface-container-low p-sm rounded"
                  >
                    <p className="font-body-md text-body-md text-on-surface line-clamp-2">
                      {result.text || 'No text detected'}
                    </p>
                    <div className="flex justify-between items-center mt-xs">
                      <span className="font-data-mono text-data-mono text-primary">
                        {(result.confidence * 100).toFixed(1)}%
                      </span>
                      <span className="font-data-mono text-data-mono text-on-surface-variant text-xs">
                        {result.created_at
                          ? new Date(result.created_at).toLocaleTimeString(
                              'en-US',
                              {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: false,
                              }
                            )
                          : 'N/A'}
                      </span>
                    </div>
                    {result.is_duplicate && (
                      <span className="font-label-caps text-label-caps text-tertiary text-xs">
                        Duplicate
                      </span>
                    )}
                  </div>
                ))}
                {ocrResults.length === 0 && (
                  <p className="font-body-md text-body-md text-on-surface-variant text-center py-lg">
                    Waiting for pipeline results...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
