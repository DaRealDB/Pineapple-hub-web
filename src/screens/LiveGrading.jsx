import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import StatusPill from '../components/StatusPill';
import HMIPanel from '../components/HMIPanel';
import WebcamFeed from '../components/WebcamFeed';
import YoloOverlay from '../components/YoloOverlay';
import useSSE from '../hooks/useSSE';
import useCrateLogCapture from '../hooks/useCrateLogCapture';
import { crateGradeLabel } from '../utils/formatters';

const OCR_API_BASE = import.meta.env.VITE_OCR_API_URL || 'http://localhost:8000';

function formatFetchError(err, url) {
  if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
    return `Cannot reach OCR backend at ${url} — is the backend running?\nStart it with:  python backend/main.py`;
  }
  return err.message || String(err);
}

// Truncate to 3 decimal places (no rounding)
const trunc3 = (n) => Math.floor(n * 1000) / 1000;

// ── shared card chrome ────────────────────────────────────────────────
const card = 'bg-surface-container border border-outline-variant rounded p-lg';
const cardTitle = 'font-label-caps text-label-caps text-on-surface-variant';

// ── consistent status pill mapping ────────────────────────────────────
function connectionPill(connected) {
  return <StatusPill variant={connected ? 'online' : 'offline'} label={connected ? 'MQTT LIVE' : 'MQTT OFFLINE'} />;
}
function scalePill(online, hasFault, isLive) {
  if (!online) return <StatusPill variant="offline" label="SCALE OFFLINE" />;
  if (hasFault) return <StatusPill variant="flagged" label="SENSOR FAULT" />;
  if (!isLive) return <StatusPill variant="pending" label="NO DATA" />;
  return <StatusPill variant="online" label="LIVE" />;
}

export default function LiveGrading({ mqtt }) {
  const {
    connectionState,
    availability,
    weightG,
    grade,
    status,
    dataValid,
    zone1,
    zone2,
    captureArmed,
    deviceState,
    publishDeviceCommand,
    publishLogTrigger,
  } = mqtt;

  const {
    connectionState: ocrConnState,
    connectionError,
    ocrResults,
    pipelineStatus,
    yoloDetections,
    crateState,
  } = useSSE();

  const latestOcr = ocrResults.length > 0 ? ocrResults[0] : null;
  useCrateLogCapture(mqtt, latestOcr);

  const [isWebcamRunning, setIsWebcamRunning] = useState(false);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [ipCameraUrl, setIpCameraUrl] = useState('');
  const [useIpCamera, setUseIpCamera] = useState(false);
  const [ocrError, setOcrError] = useState(null);
  const [crateLogs, setCrateLogs] = useState([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${OCR_API_BASE}/api/pipeline/crate-logs`);
        if (res.ok) {
          const data = await res.json();
          if (data.logs) setCrateLogs(data.logs);
        }
      } catch {}
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [isPipelineRunning]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      fetch(`${OCR_API_BASE}/api/pipeline/stop`, { method: 'POST', keepalive: true }).catch(() => {});
      fetch(`${OCR_API_BASE}/api/webcam/stop`, { method: 'POST', keepalive: true }).catch(() => {});
    };
  }, []);

  const handleStart = useCallback(async () => {
    try {
      setOcrError(null);
      const wcConfig = useIpCamera ? { ip_camera_url: ipCameraUrl } : { device_index: 0 };
      const wcRes = await fetch(`${OCR_API_BASE}/api/webcam/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wcConfig),
      });
      if (!wcRes.ok && wcRes.status !== 400) throw new Error(`Webcam start failed: ${wcRes.status}`);
      setIsWebcamRunning(true);
      const ppRes = await fetch(`${OCR_API_BASE}/api/pipeline/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      if (!ppRes.ok && ppRes.status !== 400) throw new Error(`Pipeline start failed: ${ppRes.status}`);
      setIsPipelineRunning(true);
    } catch (e) {
      console.error('[LiveGrading] Start error:', e);
      setOcrError(formatFetchError(e, OCR_API_BASE));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useIpCamera, ipCameraUrl]);

  const handleStop = useCallback(async () => {
    try { await fetch(`${OCR_API_BASE}/api/pipeline/stop`, { method: 'POST' }); setIsPipelineRunning(false); } catch {}
    try { await fetch(`${OCR_API_BASE}/api/webcam/stop`, { method: 'POST' }); setIsWebcamRunning(false); } catch {}
  }, []);

  const handleRestart = useCallback(async () => {
    await fetch(`${OCR_API_BASE}/api/pipeline/stop`, { method: 'POST' }).catch(() => {});
    await fetch(`${OCR_API_BASE}/api/webcam/stop`, { method: 'POST' }).catch(() => {});
    setIsWebcamRunning(false); setIsPipelineRunning(false); setOcrError(null);
    await new Promise((r) => setTimeout(r, 500));
    try {
      const wcConfig = useIpCamera ? { ip_camera_url: ipCameraUrl } : { device_index: 0 };
      await fetch(`${OCR_API_BASE}/api/webcam/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wcConfig) });
      setIsWebcamRunning(true);
      await fetch(`${OCR_API_BASE}/api/pipeline/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      setIsPipelineRunning(true);
    } catch (e) { setOcrError(formatFetchError(e, OCR_API_BASE)); }
  }, [useIpCamera, ipCameraUrl]);

  // ── display values ──────────────────────────────────────────────────
  const isLive = dataValid;
  const isConnected = connectionState === 'connected';
  const scaleOnline = availability === 'online';
  const hasFault = status?.hx711_fault || status?.eth_or_wifi_issue;
  const zone1Occupied = zone1 === 'occupied';

  // Task 2: Mode-aware weight display (reads deviceState.mode from MQTT)
  const displayMode = deviceState?.mode || 'g';  // 'g' or 'kg'
  const displayWeight = useMemo(() => {
    if (!isLive || weightG == null) return null;
    if (displayMode === 'kg') return { value: trunc3(weightG / 1000), unit: 'kg' };
    return { value: weightG, unit: 'g' };
  }, [isLive, weightG, displayMode]);

  const displayGrade = useMemo(() => {
    if (!isLive || !grade) return null;
    return crateGradeLabel(grade);
  }, [isLive, grade]);

  // Crate State weight row — same 3-decimal truncation
  const csWeight = useMemo(() => {
    if (crateState?.weight_g == null) return null;
    if (displayMode === 'kg') return `${trunc3(crateState.weight_g / 1000)} kg`;
    return `${crateState.weight_g} g`;
  }, [crateState?.weight_g, displayMode]);

  const yoloBoxDetected = yoloDetections?.box_present ?? false;
  const yoloHandsDetected = yoloDetections?.hands_present ?? false;
  const yoloPrimaryBox = yoloDetections?.primary_box ?? null;
  const pipelineActive = isWebcamRunning || isPipelineRunning;

  return (
    <div className="flex flex-col gap-lg">
      {/* ══════════════════════════════════════════════════════════════
          ROW 1: Camera Feed (8 cols) | Right column (4 cols)
          ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-12 gap-lg">
        {/* ── Camera Feed ── */}
        <div className="col-span-12 lg:col-span-8 bg-surface-container border border-outline-variant rounded pt-md px-md pb-sm">
          <div className="flex items-center justify-between mb-sm">
            <h3 className={cardTitle}>CAMERA FEED</h3>
            <div className="flex items-center gap-sm">
              <StatusPill variant={ocrConnState === 'connected' ? 'online' : 'offline'} label={ocrConnState === 'connected' ? 'LIVE' : 'OFFLINE'} />
              {pipelineActive ? (
                <>
                  <button onClick={handleStop} className="bg-error text-on-error py-xs px-md rounded font-label-caps text-[10px] hover:bg-error-container transition-colors">Stop</button>
                  <button onClick={handleRestart} className="bg-primary text-on-primary py-xs px-md rounded font-label-caps text-[10px] hover:brightness-110 transition-colors">Restart</button>
                </>
              ) : (
                <button onClick={handleStart} className="bg-[#10B981] text-white py-xs px-md rounded font-label-caps text-[10px] hover:brightness-110 transition-colors">Start</button>
              )}
            </div>
          </div>

          {(ocrError || connectionError) && (
            <div className="bg-error-container p-sm rounded mb-sm">
              <p className="text-on-error-container font-body-md text-xs whitespace-pre-wrap">{ocrError || connectionError}</p>
            </div>
          )}

          {!pipelineActive && (
            <div className="mb-sm p-sm bg-surface-container-low rounded">
              <div className="flex items-center gap-sm mb-xs">
                <input type="checkbox" id="ipCamToggle" checked={useIpCamera} onChange={(e) => setUseIpCamera(e.target.checked)} className="w-4 h-4" />
                <label htmlFor="ipCamToggle" className="font-body-md text-xs text-on-surface">Use IP Camera (Phone)</label>
              </div>
              {useIpCamera && (
                <input type="text" placeholder="http://192.168.1.x:port/video" value={ipCameraUrl} onChange={(e) => setIpCameraUrl(e.target.value)}
                  className="w-full px-sm py-xs rounded border border-outline-variant bg-surface-container text-on-surface font-body-md text-xs mb-xs" />
              )}
              <p className="font-body-md text-[10px] text-on-surface-variant">Install IP Webcam app on your phone and enter the URL above</p>
            </div>
          )}

          {isWebcamRunning ? (
            <div className="relative bg-surface-container-low rounded overflow-hidden leading-[0]">
              <img src={`${OCR_API_BASE}/api/webcam/stream`} alt="MJPEG stream" className="w-full block" />
              <YoloOverlay detections={yoloDetections} />
            </div>
          ) : (
            <WebcamFeed frameData={null} isRunning={false} connectionState={ocrConnState} />
          )}

          {pipelineStatus && (
            <div className="mt-sm grid grid-cols-4 gap-xs">
              <StatTile label="FPS" value={pipelineStatus.fps?.toFixed(1) || '--'} accent />
              <StatTile label="OCR" value={pipelineStatus.ocr_count ?? '--'} />
              <StatTile label="MS" value={pipelineStatus.processing_time_ms?.toFixed(0) || '--'} />
              <StatTile label="YOLO" value={pipelineStatus.yolo_inference_ms?.toFixed(0) || '--'} tertiary />
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-lg">
          {/* Recent OCR + Crate Log side by side */}
          <div className="grid grid-cols-2 gap-lg">
            <div className={card}>
              <div className="flex justify-between items-center mb-md">
                <h3 className={cardTitle}>RECENT OCR</h3>
                <span className="font-data-mono text-[10px] text-on-surface-variant">{ocrResults.length}</span>
              </div>
              {ocrResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-md text-on-surface-variant/30">
                  <span className="material-symbols-outlined text-2xl mb-sm">text_fields</span>
                  <span className="font-label-caps text-[9px]">Waiting for results...</span>
                </div>
              ) : (
                <div className="space-y-xs max-h-48 overflow-y-auto scrollbar-industrial">
                  {ocrResults.slice(0, 8).map((r, i) => (
                    <div key={i} className={`bg-surface-container-low p-sm rounded border ${r.is_duplicate ? 'border-tertiary/30' : 'border-outline-variant'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-data-mono text-xs text-on-surface truncate flex-1 mr-sm">{r.text || '(no text)'}</span>
                        <span className="font-data-mono text-[11px] text-primary flex-shrink-0">{r.confidence != null ? `${(r.confidence * 100).toFixed(0)}%` : '--'}</span>
                      </div>
                      {r.is_duplicate && <span className="font-label-caps text-[9px] text-tertiary">Dup</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`${card} flex flex-col`}>
              <h3 className={`${cardTitle} mb-md`}>CRATE LOG</h3>
              {crateLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-on-surface-variant/30 py-md">
                  <span className="material-symbols-outlined text-2xl mb-sm">inventory_2</span>
                  <span className="font-label-caps text-[9px]">No logs yet</span>
                </div>
              ) : (
                <div className="space-y-xs max-h-48 overflow-y-auto scrollbar-industrial">
                  {crateLogs.map((log, i) => (
                    <div key={i} className="bg-surface-container-low p-sm rounded border border-outline-variant">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-data-mono text-xs text-primary font-bold">{log.batch_id || '--'}</span>
                        <span className="font-data-mono text-[10px] text-on-surface-variant/50">
                          {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-body-md text-[11px] text-on-surface-variant">
                          {trunc3(log.weight_g / 1000)} kg · {log.grade}
                        </span>
                        <TriggerChip trigger={log.capture_trigger} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Current Crate Weight */}
          <section className={`${card} flex flex-col items-center justify-center text-center`}>
            <span className={`${cardTitle} mb-md`}>CURRENT CRATE WEIGHT</span>
            {displayWeight != null ? (
              <div className="flex items-baseline gap-xs">
                <h2 className="font-headline-lg text-[64px] leading-tight tabular-nums font-bold text-primary">
                  {displayWeight.unit === 'kg' ? displayWeight.value.toFixed(3) : displayWeight.value}
                </h2>
                <span className="font-headline-md text-on-surface-variant">{displayWeight.unit}</span>
              </div>
            ) : (
              <h2 className="font-headline-lg text-[64px] leading-tight tabular-nums font-bold text-on-surface-variant/20">--.---</h2>
            )}
            <div className="mt-md">
              <span className={`inline-flex items-center gap-sm px-lg py-sm rounded-full border text-label-caps font-label-caps ${
                isLive ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-surface-container-low border-outline-variant text-on-surface-variant/50'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-primary animate-pulse' : 'bg-on-surface-variant/30'}`} />
                {displayGrade || '--'}
              </span>
            </div>
            <div className="mt-md flex flex-wrap items-center justify-center gap-xs">
              {connectionPill(isConnected)}
              {scalePill(scaleOnline, hasFault, isLive)}
              <StatusPill variant={ocrConnState === 'connected' ? 'online' : 'offline'} label={ocrConnState === 'connected' ? 'OCR LIVE' : 'OCR OFFLINE'} />
            </div>
            {latestOcr?.text && (
              <div className="mt-sm text-[10px] text-tertiary font-data-mono truncate max-w-full px-sm">
                OCR: {latestOcr.text} {latestOcr.confidence != null ? `${(latestOcr.confidence * 100).toFixed(0)}%` : ''}
              </div>
            )}
          </section>

          {/* Detection Zones */}
          <div className={card}>
            <h3 className={`${cardTitle} mb-md`}>DETECTION ZONES</h3>
            <div className="space-y-sm">
              <div className="flex items-center justify-between bg-surface-container-low p-sm rounded">
                <span className="font-label-caps text-[10px] text-on-surface-variant">ZONE 2 (CRATE)</span>
                <StatusPill variant={zone2 === 'occupied' ? 'armed' : zone2 === 'clear' ? 'online' : 'pending'} label={zone2 === 'occupied' ? 'ARMED' : zone2 === 'clear' ? 'CLEAR' : 'NO DATA'} />
              </div>
              {yoloDetections ? (
                <>
                  <div className="flex items-center justify-between bg-surface-container-low p-sm rounded">
                    <span className="font-label-caps text-[10px] text-primary">YOLO: CRATE</span>
                    <StatusPill variant={yoloBoxDetected ? 'armed' : 'pending'} label={yoloBoxDetected ? `DETECTED ${yoloPrimaryBox?.confidence ? (yoloPrimaryBox.confidence * 100).toFixed(0) + '%' : ''}` : 'NONE'} />
                  </div>
                  <div className="flex items-center justify-between bg-surface-container-low p-sm rounded">
                    <span className="font-label-caps text-[10px] text-[#EF4444]">YOLO: HANDS</span>
                    <StatusPill variant={yoloHandsDetected ? 'occupied' : 'online'} label={yoloHandsDetected ? 'DETECTED' : 'CLEAR'} />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-md text-on-surface-variant/30">
                  <span className="material-symbols-outlined text-2xl mb-xs">psychology</span>
                  <span className="font-label-caps text-[10px]">YOLO not active</span>
                </div>
              )}
              {captureArmed && !zone1Occupied && (
                <div className="bg-primary/10 border border-primary/30 rounded p-sm text-center">
                  <span className="font-label-caps text-[10px] text-primary">CAPTURE ARMED</span>
                </div>
              )}
              {latestOcr?.hands_suppressed && (
                <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded p-sm text-center">
                  <span className="font-label-caps text-[10px] text-[#EF4444]">OCR SUPPRESSED</span>
                </div>
              )}
            </div>
          </div>

          {/* Crate Log State — always visible */}
          <div className={`${card} ${
            crateState?.state === 'READY' ? 'border-[#F59E0B]/50 bg-[#F59E0B]/5' :
            crateState?.state === 'LOGGED' ? 'border-[#10B981]/50 bg-[#10B981]/5' : ''
          }`}>
            <div className="flex items-center justify-between mb-md">
              <h3 className={cardTitle}>CRATE LOG STATE</h3>
              <StatusPill
                variant={!crateState ? 'offline' : crateState.state === 'READY' ? 'armed' : crateState.state === 'LOGGED' ? 'online' : crateState.state === 'AWAITING_DATA' ? 'pending' : 'offline'}
                label={crateState ? crateState.state : 'NO DATA'}
              />
            </div>
            {crateState ? (
              <>
                <div className="space-y-1">
                  <StateRow label="Batch ID" value={crateState.batch_id || '--'} active={!!crateState.batch_id} />
                  <StateRow label="Weight" value={csWeight || '--'} active={crateState.weight_g != null} />
                  <StateRow label="Grade" value={crateState.grade || '--'} />
                  <StateRow label="Hands" value={crateState.hands_present ? 'DETECTED' : 'CLEAR'} active={!crateState.hands_present} danger={crateState.hands_present} />
                  {crateState.countdown_seconds > 0 && (
                    <StateRow label="Auto-log in" value={`${crateState.countdown_seconds.toFixed(1)}s`} active />
                  )}
                  <StateRow label="Logs Committed" value={crateState.log_count ?? 0} active />
                </div>
                {crateState.state === 'READY' && crateState.hands_present && (
                  <div className="mt-md bg-[#EF4444]/10 border border-[#EF4444]/30 rounded p-sm text-center">
                    <span className="font-label-caps text-[11px] text-[#EF4444]">CLEAR HANDS FROM CAMERA TO AUTO-LOG</span>
                  </div>
                )}
                {crateState.state === 'READY' && !crateState.hands_present && crateState.countdown_seconds > 0 && (
                  <div className="mt-md bg-[#10B981]/10 border border-[#10B981]/30 rounded p-sm text-center animate-pulse">
                    <span className="font-label-caps text-[11px] text-[#10B981]">AUTO-LOGGING IN {crateState.countdown_seconds.toFixed(1)}s</span>
                  </div>
                )}
                {crateState.state === 'LOGGED' && crateState.cooldown_remaining_ms > 0 && (
                  <div className="mt-md bg-[#10B981]/10 border border-[#10B981]/30 rounded p-sm text-center">
                    <span className="font-label-caps text-[11px] text-[#10B981]">LOGGED · COOLDOWN {(crateState.cooldown_remaining_ms / 1000).toFixed(1)}s</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-md text-on-surface-variant/30">
                <span className="material-symbols-outlined text-2xl mb-sm">hourglass_top</span>
                <span className="font-label-caps text-[10px]">Start pipeline to begin</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          ROW 2: Device Controls (8 cols, under Camera Feed)
          ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-12 gap-lg">
        <div className="col-span-12 lg:col-span-8">
          <HMIPanel deviceState={deviceState} publishDeviceCommand={publishDeviceCommand} publishLogTrigger={publishLogTrigger} isLive={isConnected} crateState={crateState} />
        </div>
      </div>

    </div>
  );
}

// ── sub-components ─────────────────────────────────────────────────────

function StateRow({ label, value, active, danger }) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-on-surface-variant">{label}</span>
      <span className={`font-data-mono ${danger ? 'text-[#EF4444]' : active ? 'text-primary' : 'text-on-surface-variant/50'}`}>
        {value}
      </span>
    </div>
  );
}

function StatTile({ label, value, accent, tertiary }) {
  return (
    <div className="bg-surface-container-low p-sm rounded text-center">
      <span className="font-label-caps text-[10px] text-on-surface-variant block">{label}</span>
      <span className={`font-data-mono text-data-mono ${accent ? 'text-primary' : tertiary ? 'text-tertiary' : 'text-on-surface'}`}>
        {value}
      </span>
    </div>
  );
}

function TriggerChip({ trigger }) {
  const map = {
    auto_countdown: { icon: '⏱', label: 'AUTO', cls: 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20' },
    manual_button:  { icon: '👆', label: 'MANUAL', cls: 'text-primary bg-primary/10 border-primary/20' },
    hand_wave:      { icon: '👋', label: 'WAVE', cls: 'text-tertiary bg-tertiary/10 border-tertiary/20' },
  };
  const t = map[trigger] || { icon: '', label: trigger || 'UNKNOWN', cls: 'text-on-surface-variant bg-surface-container-high border-outline-variant' };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded text-[9px] font-label-caps border ${t.cls}`}>
      {t.icon} {t.label}
    </span>
  );
}
