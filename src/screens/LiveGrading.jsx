import { useMemo } from 'react';
import StatusPill from '../components/StatusPill';
import HMIPanel from '../components/HMIPanel';
import WebcamFeed from '../components/WebcamFeed';
import useWebSocket from '../hooks/useWebSocket';
import { crateGradeLabel } from '../utils/formatters';

/**
 * Live Grading screen — route: /
 *
 * Primary operations dashboard. Shows live crate weight from the scale,
 * HMI device controls (RBAC-gated), camera/OCR preview, zone status,
 * weight gauge, and recent crate log.
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
    zone1,
    zone2,
    captureArmed,
    deviceState,
    publishDeviceCommand,
  } = mqtt;

  // Camera / OCR feed (separate WebSocket to Python OCR backend)
  const {
    connectionState: ocrConnState,
    webcamFrame,
    ocrResults,
    pipelineStatus,
  } = useWebSocket();

  const isLive = dataValid;
  const isConnected = connectionState === 'connected';
  const scaleOnline = availability === 'online';
  const hasFault = status?.hx711_fault || status?.eth_or_wifi_issue;
  const zone1Occupied = zone1 === 'occupied';

  /* ── Live display values (null when no valid data) ── */
  const displayWeightKg = useMemo(() => {
    if (!isLive || weightG == null) return null;
    return weightG / 1000;
  }, [isLive, weightG]);

  const displayGrade = useMemo(() => {
    if (!isLive || !grade) return null;
    return crateGradeLabel(grade);
  }, [isLive, grade]);

  /* ── Gauge (0–30 kg crate range) ── */
  const GAUGE_MAX_KG = 30;
  const gaugePercent = useMemo(() => {
    if (!isLive || weightG == null) return 0;
    return Math.min(100, Math.max(0, Math.round((weightG / 1000 / GAUGE_MAX_KG) * 100)));
  }, [isLive, weightG]);

  const circumference = 351.8; // 2π × 56
  const dashOffset = circumference - (gaugePercent / 100) * circumference;

  /* ── Latest OCR result ── */
  const latestOcr = ocrResults.length > 0 ? ocrResults[0] : null;

  return (
    <div className="grid grid-cols-12 gap-lg">
      {/* ── LEFT COLUMN: Weight KPI, Gauge, Zones ── */}
      <div className="col-span-12 lg:col-span-7 flex flex-col gap-lg">
        {/* Primary Weight KPI */}
        <section className="bg-surface-container border border-outline-variant rounded p-xl flex flex-col items-center justify-center text-center">
          <span className="font-label-caps text-label-caps text-on-surface-variant mb-md">
            CURRENT CRATE WEIGHT
          </span>

          {displayWeightKg != null ? (
            <div className="flex items-baseline gap-sm">
              <h2
                className={`font-headline-lg text-[80px] leading-tight tabular-nums font-bold ${
                  zone1Occupied ? 'text-on-surface-variant line-through' : 'text-primary'
                }`}
              >
                {displayWeightKg.toFixed(2)}
              </h2>
              <span className="font-headline-md text-on-surface-variant">kg</span>
            </div>
          ) : (
            <h2 className="font-headline-lg text-[80px] leading-tight tabular-nums font-bold text-on-surface-variant/30">
              --.--
            </h2>
          )}

          {/* Status indicators */}
          <div className="mt-sm flex flex-wrap items-center justify-center gap-xs">
            {zone1Occupied && (
              <StatusPill variant="occupied" label="ZONE 1 OCCUPIED — WEIGHT SUPPRESSED" />
            )}
            {!isConnected && (
              <StatusPill variant="offline" label="MQTT DISCONNECTED" />
            )}
            {isConnected && !scaleOnline && (
              <StatusPill variant="offline" label="SCALE OFFLINE" />
            )}
            {isConnected && scaleOnline && hasFault && (
              <StatusPill variant="flagged" label="SENSOR FAULT — DATA INVALID" />
            )}
            {isConnected && scaleOnline && !hasFault && zone1 == null && (
              <StatusPill variant="pending" label="WAITING FOR DATA" />
            )}
            {isLive && !zone1Occupied && (
              <StatusPill variant="online" label="LIVE" />
            )}
          </div>

          {/* Grade pill + latest OCR */}
          <div className="mt-xl flex items-center gap-lg">
            <div className="px-lg py-sm bg-primary/10 border border-primary/30 rounded-full inline-flex items-center gap-md">
              <span
                className={`w-3 h-3 rounded-full ${
                  isLive && !zone1Occupied ? 'bg-primary animate-pulse' : 'bg-on-surface-variant'
                }`}
              />
              <span className="font-label-caps text-label-caps text-primary tracking-widest">
                {displayGrade || '--'}
              </span>
              {isLive && !zone1Occupied && (
                <span className="font-label-caps text-[10px] text-[#10B981]">LIVE</span>
              )}
            </div>

            {/* OCR batch ID preview */}
            {latestOcr?.text && (
              <div className="px-lg py-sm bg-tertiary/10 border border-tertiary/30 rounded-full inline-flex items-center gap-md">
                <span className="material-symbols-outlined text-sm text-tertiary">qr_code_scanner</span>
                <span className="font-data-mono text-data-mono text-tertiary">
                  {latestOcr.text}
                </span>
                {latestOcr.confidence != null && (
                  <span className="font-label-caps text-[10px] text-tertiary/70">
                    {(latestOcr.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Gauge + Zone Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
          {/* Gauge */}
          <div className="bg-surface-container border border-outline-variant rounded p-lg flex items-center gap-xl">
            <div className="relative w-32 h-32 flex-shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64" cy="64" fill="transparent" r="56"
                  stroke="currentColor" strokeWidth="8"
                  className="text-surface-container-highest"
                />
                <circle
                  cx="64" cy="64" fill="transparent" r="56"
                  stroke="currentColor" strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="text-primary transition-[stroke-dashoffset] duration-500 ease-out"
                  style={{ stroke: isLive ? '#06b6d4' : '#3d494c' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-data-mono text-data-mono text-on-surface tabular-nums">
                  {isLive ? `${gaugePercent}%` : '--'}
                </span>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-sm">
                CRATE WEIGHT RANGE
              </h3>
              <div className="flex justify-between text-xs font-data-mono mb-xs">
                <span>0 kg</span>
                <span className="text-primary">Target</span>
                <span>{GAUGE_MAX_KG} kg</span>
              </div>
              <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${isLive ? gaugePercent : 0}%` }}
                />
              </div>
              <p className="font-body-md text-body-md text-on-surface mt-md leading-snug">
                {isLive
                  ? 'Current crate reading is within the Crate Weight Window for Line B.'
                  : 'Awaiting live scale data from broker.'}
              </p>
            </div>
          </div>

          {/* Zone Status */}
          <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col gap-md">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-sm">
              CAMERA ZONES
            </h3>
            <div className="flex gap-sm">
              <div className="flex-1 bg-surface-container-low p-sm rounded">
                <div className="flex items-center justify-between">
                  <span className="font-label-caps text-[10px] text-on-surface-variant">
                    ZONE 1 (SCALE)
                  </span>
                  <StatusPill
                    variant={zone1 === 'occupied' ? 'occupied' : zone1 === 'clear' ? 'clear' : 'pending'}
                    label={zone1 === 'occupied' ? 'OCCUPIED' : zone1 === 'clear' ? 'CLEAR' : 'NO DATA'}
                  />
                </div>
                <p className="font-body-md text-[11px] text-on-surface-variant mt-xs">
                  {zone1 === 'occupied'
                    ? 'Weight reading suppressed — hand/forklift in scale area.'
                    : zone1 === 'clear'
                      ? 'Scale area clear — weight readings valid.'
                      : 'Camera zone sensor not connected.'}
                </p>
              </div>
              <div className="flex-1 bg-surface-container-low p-sm rounded">
                <div className="flex items-center justify-between">
                  <span className="font-label-caps text-[10px] text-on-surface-variant">
                    ZONE 2 (CRATE)
                  </span>
                  <StatusPill
                    variant={zone2 === 'occupied' ? 'armed' : zone2 === 'clear' ? 'clear' : 'pending'}
                    label={zone2 === 'occupied' ? 'ARMED' : zone2 === 'clear' ? 'CLEAR' : 'NO DATA'}
                  />
                </div>
                <p className="font-body-md text-[11px] text-on-surface-variant mt-xs">
                  {zone2 === 'occupied'
                    ? 'Capture sequence armed — crate placement detected.'
                    : zone2 === 'clear'
                      ? 'No crate detected in capture zone.'
                      : 'Camera zone sensor not connected.'}
                </p>
              </div>
            </div>
            {captureArmed && !zone1Occupied && (
              <div className="mt-sm bg-primary/10 border border-primary/30 rounded p-sm text-center">
                <span className="font-label-caps text-label-caps text-primary">
                  ⏳ CAPTURE SEQUENCE ACTIVE
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN: HMI Controls, Camera Feed, Crate Log ── */}
      <div className="col-span-12 lg:col-span-5 flex flex-col gap-lg">
        {/* HMI Device Controls */}
        <HMIPanel
          deviceState={deviceState}
          publishDeviceCommand={publishDeviceCommand}
          isLive={isConnected}
        />

        {/* Camera / OCR Feed */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg">
          <div className="flex items-center justify-between mb-md">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant">
              CAMERA FEED
            </h3>
            <StatusPill
              variant={ocrConnState === 'connected' ? 'online' : 'offline'}
              label={ocrConnState === 'connected' ? 'LIVE' : 'OFFLINE'}
            />
          </div>

          <WebcamFeed
            frameData={webcamFrame?.frame_data}
            isRunning={ocrConnState === 'connected'}
          />

          {/* Pipeline stats */}
          {pipelineStatus && (
            <div className="mt-sm grid grid-cols-3 gap-xs">
              <div className="bg-surface-container-low p-sm rounded text-center">
                <span className="font-label-caps text-[10px] text-on-surface-variant block">FPS</span>
                <span className="font-data-mono text-data-mono text-primary">
                  {pipelineStatus.fps?.toFixed(1) || '--'}
                </span>
              </div>
              <div className="bg-surface-container-low p-sm rounded text-center">
                <span className="font-label-caps text-[10px] text-on-surface-variant block">OCR</span>
                <span className="font-data-mono text-data-mono text-on-surface">
                  {pipelineStatus.ocr_count ?? '--'}
                </span>
              </div>
              <div className="bg-surface-container-low p-sm rounded text-center">
                <span className="font-label-caps text-[10px] text-on-surface-variant block">MS</span>
                <span className="font-data-mono text-data-mono text-on-surface">
                  {pipelineStatus.processing_time_ms?.toFixed(0) || '--'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Recent OCR extractions */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-md">
            RECENT OCR
          </h3>
          {ocrResults.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant text-center py-md">
              Waiting for OCR results...
            </p>
          ) : (
            <div className="space-y-xs max-h-48 overflow-y-auto scrollbar-industrial">
              {ocrResults.slice(0, 5).map((r, i) => (
                <div key={i} className="bg-surface-container-low p-sm rounded flex items-center justify-between">
                  <span className="font-data-mono text-xs text-on-surface truncate flex-1 mr-sm">
                    {r.text || '(no text)'}
                  </span>
                  <span className="font-data-mono text-xs text-primary flex-shrink-0">
                    {r.confidence != null ? `${(r.confidence * 100).toFixed(0)}%` : '--'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Crate Log — quick preview */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-lg">
            CRATE LOG (LINE B)
          </h3>
          <div className="flex flex-col items-center justify-center py-lg text-center">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-sm">
              inventory_2
            </span>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {isConnected
                ? 'Crate log entries will appear here as crates are processed.'
                : 'Connect to the MQTT broker to begin logging crates.'}
            </p>
            <p className="font-data-mono text-xs text-on-surface-variant/50 mt-xs">
              Logs saved to PostgreSQL via Express API
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
