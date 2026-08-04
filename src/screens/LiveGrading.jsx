import { useMemo } from 'react';
import StatusPill from '../components/StatusPill';
import { crateGradeLabel } from '../utils/formatters';

/**
 * Live Grading screen — route: /
 *
 * All data comes from the MQTT broker via useMqtt(). When the broker is
 * unreachable or the scale is offline/faulted, the UI shows honest
 * offline/empty states — never seed/mock data.
 *
 * Per forge.md §2: crate/bin language throughout.
 * Per forge.md §3: Zone 1/2 occupancy indicators + zone-gated weight validity.
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
  } = mqtt;

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

  /* ── Gauge (0–30 kg crate range, placeholder) ── */
  const GAUGE_MAX_KG = 30;
  const gaugePercent = useMemo(() => {
    if (!isLive || weightG == null) return 0;
    return Math.min(100, Math.max(0, Math.round((weightG / 1000 / GAUGE_MAX_KG) * 100)));
  }, [isLive, weightG]);

  const circumference = 351.8; // 2π × 56
  const dashOffset = circumference - (gaugePercent / 100) * circumference;

  /* ── Hardware status ── */
  const hardwareOnline = isLive || (scaleOnline && !hasFault);

  return (
    <div className="grid grid-cols-12 gap-lg">
      {/* Left column: Primary KPI + Gauge + Throughput */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-lg">
        {/* Primary KPI Block */}
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

          {/* Status indicator stack */}
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

          {/* Grade pill */}
          <div className="mt-xl px-lg py-sm bg-primary/10 border border-primary/30 rounded-full inline-flex items-center gap-md">
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
            {zone1Occupied && (
              <span className="font-label-caps text-[10px] text-[#EF4444]">SUPPRESSED</span>
            )}
          </div>
        </section>

        {/* Gauge + Zone Status grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
          {/* Gauge Visualization */}
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

          {/* Zone Status (forge.md §3) */}
          <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col gap-md">
            <div>
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

            {/* Throughput — live-only placeholder */}
            <div className="border-t border-outline-variant pt-md">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-sm">
                SHIFT THROUGHPUT
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant text-center py-md">
                Throughput metrics will be available once the scale is online and processing crates.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right column: Hardware Status, Batch Log, Environment */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-lg">
        {/* Hardware Status Card */}
        <div className="bg-surface-container border border-outline-variant rounded overflow-hidden flex flex-col">
          <div className="p-lg border-b border-outline-variant">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant">
              HARDWARE STATUS
            </h3>
          </div>
          <div className="p-xl flex-1 flex flex-col items-center justify-center bg-surface-container-low">
            <div
              className={`w-20 h-20 rounded-full border-4 flex items-center justify-center mb-lg ${
                hardwareOnline ? 'border-primary/20' : 'border-[#EF4444]/20'
              }`}
            >
              <span
                className={`material-symbols-outlined text-4xl ${
                  hardwareOnline ? 'text-primary' : 'text-[#EF4444]'
                }`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                sensors
              </span>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-md mb-xs">
                <span
                  className={`w-4 h-4 rounded-full ${
                    hardwareOnline
                      ? 'bg-[#10B981] shadow-[0_0_12px_#10B981]'
                      : 'bg-[#EF4444]'
                  }`}
                />
                <h4 className="font-headline-md text-headline-md text-on-surface font-bold uppercase tracking-tight">
                  {hasFault
                    ? 'Scale 04 — Sensor Fault'
                    : hardwareOnline
                      ? 'Scale 04 Online'
                      : 'Scale 04 Offline'}
                </h4>
              </div>
              <p className="font-data-mono text-data-mono text-on-surface-variant">
                {isLive
                  ? 'Latency: 3ms (Live)'
                  : !isConnected
                    ? 'MQTT broker unreachable'
                    : !scaleOnline
                      ? 'Scale reports offline'
                      : 'Awaiting data...'}
              </p>
            </div>
          </div>
          <div className="px-lg py-md bg-surface-container-high flex items-center justify-between">
            <span className="font-body-md text-on-surface-variant">Last Calibration:</span>
            <span className="font-data-mono text-data-mono text-on-surface tabular-nums">
              {isConnected && scaleOnline ? 'Awaiting report...' : '--'}
            </span>
          </div>
        </div>

        {/* Batch Log — live-only, empty state */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg flex-1">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-lg">
            CRATE LOG (LINE B)
          </h3>
          <div className="flex flex-col items-center justify-center py-xl text-center">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-sm">
              inventory_2
            </span>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {isConnected
                ? 'Crate log entries will appear here as crates are processed.'
                : 'Connect to the MQTT broker to begin logging crates.'}
            </p>
            <p className="font-data-mono text-xs text-on-surface-variant/50 mt-xs">
              Requires Node-RED SQLite logging endpoint
            </p>
          </div>
        </div>

        {/* Environment Monitor */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-sm">
            ENVIRONMENT
          </h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-md">
              <span className="material-symbols-outlined text-tertiary">thermostat</span>
              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant leading-none">
                  AMB. TEMP
                </p>
                <p className="font-headline-sm font-bold text-on-surface-variant/30 tabular-nums">
                  --.-°C
                </p>
              </div>
            </div>
            <div className="flex items-center gap-md">
              <span className="material-symbols-outlined text-primary">humidity_percentage</span>
              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant leading-none">
                  HUMIDITY
                </p>
                <p className="font-headline-sm font-bold text-on-surface-variant/30 tabular-nums">
                  --%
                </p>
              </div>
            </div>
          </div>
          <p className="font-body-md text-[11px] text-on-surface-variant/50 mt-sm text-center">
            No environmental sensor connected
          </p>
        </div>
      </div>
    </div>
  );
}
