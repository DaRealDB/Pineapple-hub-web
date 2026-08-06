import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import StatusPill from '../components/StatusPill';
import HMIPanel from '../components/HMIPanel';
import WebcamFeed from '../components/WebcamFeed';
import PipelineStatus from '../components/PipelineStatus';
import useWebSocket from '../hooks/useWebSocket';
import useCrateLogCapture from '../hooks/useCrateLogCapture';
import { crateGradeLabel } from '../utils/formatters';

const OCR_API_BASE = import.meta.env.VITE_OCR_API_URL || 'http://localhost:8000';

function formatFetchError(err, url) {
  if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
    return `Cannot reach OCR backend at ${url} — is the backend running?\nStart it with:  python backend/main.py`;
  }
  return err.message || String(err);
}

/**
 * Live Grading screen — route: /
 *
 * Primary operations dashboard. Shows live crate weight, HMI controls,
 * full OCR pipeline (camera + image upload), weight gauge, and crate log.
 *
 * @param {{ mqtt: object }} props
 */
export default function LiveGrading({ mqtt }) {
  const {
    connectionState,
    availability,
    weightG,
    grade,
    status,
    dataValid,
    deviceState,
    publishDeviceCommand,
  } = mqtt;

  // ── OCR pipeline WebSocket ──
  const {
    connectionState: ocrConnState,
    connectionError,
    ocrResults,
    pipelineStatus,
    webcamFrame: wsWebcamFrame,
  } = useWebSocket();

  // Wire OCR results + MQTT weight/zone state → crate_log creation
  const latestOcr = ocrResults.length > 0 ? ocrResults[0] : null;
  useCrateLogCapture(mqtt, latestOcr);

  // ── OCR pipeline state (auto-start/stop/restart) ──
  const [isWebcamRunning, setIsWebcamRunning] = useState(false);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [webcamFrame, setWebcamFrame] = useState(null);
  const [ipCameraUrl, setIpCameraUrl] = useState('');
  const [useIpCamera, setUseIpCamera] = useState(false);
  const [ocrError, setOcrError] = useState(null);

  // Image-upload OCR
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedImageData, setUploadedImageData] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageOcrError, setImageOcrError] = useState(null);

  const mountedRef = useRef(true);

  // ── Auto-start webcam + pipeline on mount ──
  useEffect(() => {
    mountedRef.current = true;

    const autoStart = async () => {
      try {
        setOcrError(null);

        const wcConfig = useIpCamera
          ? { ip_camera_url: ipCameraUrl }
          : { device_index: 0 };

        const wcRes = await fetch(`${OCR_API_BASE}/api/webcam/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wcConfig),
        });
        if (!wcRes.ok && wcRes.status !== 400) {
          throw new Error(`Webcam start failed: ${wcRes.status}`);
        }
        if (!mountedRef.current) return;
        setIsWebcamRunning(true);

        const ppRes = await fetch(`${OCR_API_BASE}/api/pipeline/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!ppRes.ok && ppRes.status !== 400) {
          throw new Error(`Pipeline start failed: ${ppRes.status}`);
        }
        if (!mountedRef.current) return;
        setIsPipelineRunning(true);
      } catch (e) {
        console.error('[LiveGrading] OCR auto-start error:', e);
        if (mountedRef.current) setOcrError(formatFetchError(e, OCR_API_BASE));
      }
    };

    autoStart();

    return () => {
      mountedRef.current = false;
      fetch(`${OCR_API_BASE}/api/pipeline/stop`, { method: 'POST' }).catch(() => {});
      fetch(`${OCR_API_BASE}/api/webcam/stop`, { method: 'POST' }).catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync WebSocket frame
  useEffect(() => {
    if (isPipelineRunning && wsWebcamFrame) {
      setWebcamFrame(wsWebcamFrame.frame_data);
    }
  }, [isPipelineRunning, wsWebcamFrame]);

  const handleStop = useCallback(async () => {
    try { await fetch(`${OCR_API_BASE}/api/pipeline/stop`, { method: 'POST' }); setIsPipelineRunning(false); } catch (e) { console.error(e); }
    try { await fetch(`${OCR_API_BASE}/api/webcam/stop`, { method: 'POST' }); setIsWebcamRunning(false); setWebcamFrame(null); } catch (e) { console.error(e); }
  }, []);

  const handleRestart = useCallback(async () => {
    await fetch(`${OCR_API_BASE}/api/pipeline/stop`, { method: 'POST' }).catch(() => {});
    await fetch(`${OCR_API_BASE}/api/webcam/stop`, { method: 'POST' }).catch(() => {});
    setIsWebcamRunning(false); setIsPipelineRunning(false); setWebcamFrame(null); setOcrError(null);
    await new Promise((r) => setTimeout(r, 500));
    try {
      const wcConfig = useIpCamera ? { ip_camera_url: ipCameraUrl } : { device_index: 0 };
      await fetch(`${OCR_API_BASE}/api/webcam/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wcConfig) });
      setIsWebcamRunning(true);
      await fetch(`${OCR_API_BASE}/api/pipeline/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      setIsPipelineRunning(true);
    } catch (e) { setOcrError(formatFetchError(e, OCR_API_BASE)); }
  }, [useIpCamera, ipCameraUrl]);

  // Image upload OCR
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setUploadedImage(reader.result); setUploadedImageData(reader.result); setOcrResult(null); setImageOcrError(null); };
      reader.readAsDataURL(file);
    }
  };

  const processImageOCR = async () => {
    if (!uploadedImageData) return;
    setIsProcessing(true); setImageOcrError(null);
    try {
      const response = await fetch(uploadedImageData); const blob = await response.blob();
      const base64Data = await new Promise((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result.split(',')[1]); r.readAsDataURL(blob); });
      const ocrResponse = await fetch(`${OCR_API_BASE}/api/ocr/process`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_data: base64Data }) });
      if (!ocrResponse.ok) { const et = await ocrResponse.text(); throw new Error(`OCR failed: ${ocrResponse.status} - ${et}`); }
      setOcrResult(await ocrResponse.json());
    } catch (err) { setImageOcrError(err.message); }
    finally { setIsProcessing(false); }
  };

  // ── Display values ──
  const isLive = dataValid;
  const isConnected = connectionState === 'connected';
  const scaleOnline = availability === 'online';
  const hasFault = status?.hx711_fault || status?.eth_or_wifi_issue;

  const displayWeightKg = useMemo(() => { if (!isLive || weightG == null) return null; return weightG / 1000; }, [isLive, weightG]);
  const displayGrade = useMemo(() => { if (!isLive || !grade) return null; return crateGradeLabel(grade); }, [isLive, grade]);

  const GAUGE_MAX_KG = 30;
  const gaugePercent = useMemo(() => { if (!isLive || weightG == null) return 0; return Math.min(100, Math.max(0, Math.round((weightG / 1000 / GAUGE_MAX_KG) * 100))); }, [isLive, weightG]);
  const circumference = 351.8;
  const dashOffset = circumference - (gaugePercent / 100) * circumference;

  return (
    <div className="grid grid-cols-12 gap-lg">
      {/* ── LEFT COLUMN ── */}
      <div className="col-span-12 lg:col-span-7 flex flex-col gap-lg">
        {/* Weight KPI */}
        <section className="bg-surface-container border border-outline-variant rounded p-xl flex flex-col items-center justify-center text-center">
          <span className="font-label-caps text-label-caps text-on-surface-variant mb-md">CURRENT CRATE WEIGHT</span>
          {displayWeightKg != null ? (
            <div className="flex items-baseline gap-sm">
              <h2 className="font-headline-lg text-[80px] leading-tight tabular-nums font-bold text-primary">{displayWeightKg.toFixed(2)}</h2>
              <span className="font-headline-md text-on-surface-variant">kg</span>
            </div>
          ) : (
            <h2 className="font-headline-lg text-[80px] leading-tight tabular-nums font-bold text-on-surface-variant/30">--.--</h2>
          )}
          <div className="mt-sm flex flex-wrap items-center justify-center gap-xs">
            {!isConnected && <StatusPill variant="offline" label="MQTT DISCONNECTED" />}
            {isConnected && !scaleOnline && <StatusPill variant="offline" label="SCALE OFFLINE" />}
            {isConnected && scaleOnline && hasFault && <StatusPill variant="flagged" label="SENSOR FAULT — DATA INVALID" />}
            {isConnected && scaleOnline && !hasFault && !isLive && <StatusPill variant="pending" label="WAITING FOR DATA" />}
            {isLive && <StatusPill variant="online" label="LIVE" />}
          </div>
          <div className="mt-xl flex items-center gap-lg">
            <div className="px-lg py-sm bg-primary/10 border border-primary/30 rounded-full inline-flex items-center gap-md">
              <span className={`w-3 h-3 rounded-full ${isLive ? 'bg-primary animate-pulse' : 'bg-on-surface-variant'}`} />
              <span className="font-label-caps text-label-caps text-primary tracking-widest">{displayGrade || '--'}</span>
              {isLive && <span className="font-label-caps text-[10px] text-[#10B981]">LIVE</span>}
            </div>
            {latestOcr?.text && (
              <div className="px-lg py-sm bg-tertiary/10 border border-tertiary/30 rounded-full inline-flex items-center gap-md">
                <span className="material-symbols-outlined text-sm text-tertiary">qr_code_scanner</span>
                <span className="font-data-mono text-data-mono text-tertiary">{latestOcr.text}</span>
                {latestOcr.confidence != null && <span className="font-label-caps text-[10px] text-tertiary/70">{(latestOcr.confidence * 100).toFixed(0)}%</span>}
              </div>
            )}
          </div>
        </section>

        {/* Gauge + Image OCR row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
          {/* Gauge */}
          <div className="bg-surface-container border border-outline-variant rounded p-lg flex items-center gap-xl">
            <div className="relative w-32 h-32 flex-shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="64" cy="64" fill="transparent" r="56" stroke="currentColor" strokeWidth="8" className="text-surface-container-highest" />
                <circle cx="64" cy="64" fill="transparent" r="56" stroke="currentColor" strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={dashOffset} className="text-primary transition-[stroke-dashoffset] duration-500 ease-out" style={{ stroke: isLive ? '#06b6d4' : '#3d494c' }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-data-mono text-data-mono text-on-surface tabular-nums">{isLive ? `${gaugePercent}%` : '--'}</span>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-sm">CRATE WEIGHT RANGE</h3>
              <div className="flex justify-between text-xs font-data-mono mb-xs"><span>0 kg</span><span className="text-primary">Target</span><span>{GAUGE_MAX_KG} kg</span></div>
              <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${isLive ? gaugePercent : 0}%` }} /></div>
              <p className="font-body-md text-body-md text-on-surface mt-md leading-snug">{isLive ? 'Current crate reading is within the Crate Weight Window for Line B.' : 'Awaiting live scale data from broker.'}</p>
            </div>
          </div>

          {/* Image to Text OCR */}
          <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-sm">IMAGE TO TEXT OCR</h3>
            <input type="file" accept="image/*" onChange={handleImageUpload}
              className="w-full text-xs text-on-surface-variant file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-on-primary hover:file:bg-primary-container mb-sm" />
            {uploadedImage && (
              <div className="flex-1 flex flex-col">
                <img src={uploadedImage} alt="Uploaded" className="w-full h-32 object-cover rounded border border-outline-variant mb-sm" />
                <button onClick={processImageOCR} disabled={isProcessing}
                  className="w-full bg-primary text-on-primary py-xs rounded font-label-caps text-label-caps hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {isProcessing ? 'PROCESSING...' : 'PROCESS OCR'}
                </button>
              </div>
            )}
            {imageOcrError && <p className="text-[#EF4444] font-body-md text-xs mt-xs">{imageOcrError}</p>}
            {ocrResult && (
              <div className="mt-sm bg-surface-container-low p-sm rounded space-y-xs">
                <div className="flex justify-between"><span className="font-label-caps text-[10px] text-on-surface-variant">TEXT</span><span className="font-data-mono text-xs text-primary">{ocrResult.confidence ? `${(ocrResult.confidence * 100).toFixed(1)}%` : '--'}</span></div>
                <p className="font-body-md text-body-md text-on-surface">{ocrResult.text || 'No text detected'}</p>
                {ocrResult.is_duplicate && <p className="font-label-caps text-[10px] text-tertiary">⚠ Duplicate ({(ocrResult.similarity_score * 100).toFixed(0)}% similar)</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div className="col-span-12 lg:col-span-5 flex flex-col gap-lg">
        {/* HMI Controls */}
        <HMIPanel deviceState={deviceState} publishDeviceCommand={publishDeviceCommand} isLive={isConnected} />

        {/* Camera Feed */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg">
          <div className="flex items-center justify-between mb-md">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant">CAMERA FEED</h3>
            <div className="flex items-center gap-sm">
              <StatusPill variant={ocrConnState === 'connected' ? 'online' : 'offline'} label={ocrConnState === 'connected' ? 'LIVE' : 'OFFLINE'} />
              {(isWebcamRunning || isPipelineRunning) && (
                <>
                  <button onClick={handleStop} className="bg-error text-on-error py-xs px-sm rounded font-label-caps text-[10px] hover:bg-error-container transition-colors">Stop</button>
                  <button onClick={handleRestart} className="bg-primary text-on-primary py-xs px-sm rounded font-label-caps text-[10px] hover:brightness-110 transition-colors">Restart</button>
                </>
              )}
            </div>
          </div>

          {/* Error banner */}
          {(ocrError || connectionError) && (
            <div className="bg-error-container p-sm rounded mb-sm"><p className="text-on-error-container font-body-md text-xs whitespace-pre-wrap">{ocrError || connectionError}</p></div>
          )}

          {/* IP Camera toggle */}
          <div className="mb-sm p-sm bg-surface-container-low rounded">
            <div className="flex items-center gap-sm mb-xs">
              <input type="checkbox" id="ipCamToggle" checked={useIpCamera} onChange={(e) => setUseIpCamera(e.target.checked)} className="w-4 h-4" />
              <label htmlFor="ipCamToggle" className="font-body-md text-xs text-on-surface">Use IP Camera (Phone)</label>
            </div>
            {useIpCamera && <input type="text" placeholder="http://192.168.1.x:port/video" value={ipCameraUrl} onChange={(e) => setIpCameraUrl(e.target.value)} className="w-full px-sm py-xs rounded border border-outline-variant bg-surface-container text-on-surface font-body-md text-xs mb-xs" />}
            <p className="font-body-md text-[10px] text-on-surface-variant">Install IP Webcam app on your phone and enter the URL above</p>
          </div>

          {/* Webcam display */}
          {isWebcamRunning && !isPipelineRunning ? (
            <div className="aspect-video bg-surface-container-low rounded flex items-center justify-center overflow-hidden">
              <img src={`${OCR_API_BASE}/api/webcam/stream`} alt="MJPEG stream" className="w-full h-full object-cover" />
            </div>
          ) : (
            <WebcamFeed frameData={webcamFrame} isRunning={isWebcamRunning || isPipelineRunning} />
          )}

          {/* Pipeline stats */}
          {pipelineStatus && (
            <div className="mt-sm grid grid-cols-3 gap-xs">
              <div className="bg-surface-container-low p-sm rounded text-center"><span className="font-label-caps text-[10px] text-on-surface-variant block">FPS</span><span className="font-data-mono text-data-mono text-primary">{pipelineStatus.fps?.toFixed(1) || '--'}</span></div>
              <div className="bg-surface-container-low p-sm rounded text-center"><span className="font-label-caps text-[10px] text-on-surface-variant block">OCR</span><span className="font-data-mono text-data-mono text-on-surface">{pipelineStatus.ocr_count ?? '--'}</span></div>
              <div className="bg-surface-container-low p-sm rounded text-center"><span className="font-label-caps text-[10px] text-on-surface-variant block">MS</span><span className="font-data-mono text-data-mono text-on-surface">{pipelineStatus.processing_time_ms?.toFixed(0) || '--'}</span></div>
            </div>
          )}
        </div>

        {/* Pipeline Status */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-md">PIPELINE STATUS</h3>
          <PipelineStatus status={pipelineStatus} />
        </div>

        {/* Recent OCR */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg">
          <div className="flex justify-between items-center mb-md">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant">RECENT OCR</h3>
            <span className="font-data-mono text-[10px] text-on-surface-variant">{ocrResults.length} results</span>
          </div>
          {ocrResults.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant text-center py-md">Waiting for OCR results...</p>
          ) : (
            <div className="space-y-xs max-h-48 overflow-y-auto scrollbar-industrial">
              {ocrResults.slice(0, 8).map((r, i) => (
                <div key={i} className={`bg-surface-container-low p-sm rounded border ${r.is_duplicate ? 'border-tertiary' : 'border-outline-variant'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-data-mono text-xs text-on-surface truncate flex-1 mr-sm">{r.text || '(no text)'}</span>
                    <span className="font-data-mono text-xs text-primary flex-shrink-0">{r.confidence != null ? `${(r.confidence * 100).toFixed(0)}%` : '--'}</span>
                  </div>
                  {r.is_duplicate && <span className="font-label-caps text-[10px] text-tertiary">Duplicate</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Crate Log */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-lg">CRATE LOG (LINE B)</h3>
          <div className="flex flex-col items-center justify-center py-lg text-center">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-sm">inventory_2</span>
            <p className="font-body-md text-body-md text-on-surface-variant">{isConnected ? 'Crate log entries will appear here as crates are processed.' : 'Connect to the MQTT broker to begin logging crates.'}</p>
            <p className="font-data-mono text-xs text-on-surface-variant/50 mt-xs">Logs saved to PostgreSQL via Express API</p>
          </div>
        </div>
      </div>
    </div>
  );
}
