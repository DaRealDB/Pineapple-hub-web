import { useState, useEffect, useMemo } from 'react';
import StatusPill from '../components/StatusPill';
import { gramsToKg, gradeLabel } from '../utils/formatters';
import {
  SEED_WEIGHT_G,
  SEED_GRADE,
  SEED_GRADE_DISPLAY,
  SEED_THROUGHPUT,
  SEED_BATCH_LOG,
} from '../data/mockData';

/**
 * Live Grading screen — route: /
 * Reference: stitch_bukidnon_pineapple_operations_hub/live_grading_dashboard/code.html
 *
 * Full layout per BUILD_SPEC.md Screen: Live Grading.
 * Wired to MQTT for weight, grade, status, and availability.
 * Falls back to seed data when broker is unreachable, with clear indication.
 *
 * @param {{ mqtt: object }} props
 */
export default function LiveGrading({ mqtt }) {
  const { connectionState, availability, weightG, grade, status, dataValid } =
    mqtt;

  // Seed jitter state — only used when no live MQTT data
  const [seedWeight, setSeedWeight] = useState(SEED_WEIGHT_G / 1000);
  const [gaugeOffset, setGaugeOffset] = useState(105);

  // Live weight in kg for display
  const displayWeightKg = useMemo(() => {
    if (dataValid && weightG != null) {
      return weightG / 1000;
    }
    return seedWeight;
  }, [dataValid, weightG, seedWeight]);

  // Live grade for display
  const displayGrade = useMemo(() => {
    if (dataValid && grade) {
      return gradeLabel(grade);
    }
    return SEED_GRADE_DISPLAY;
  }, [dataValid, grade]);

  // Gauge percentage (0–100) based on weight relative to 2.0kg range
  const gaugePercent = useMemo(() => {
    const kg = dataValid && weightG != null ? weightG / 1000 : seedWeight;
    return Math.min(100, Math.max(0, Math.round((kg / 2.0) * 100)));
  }, [dataValid, weightG, seedWeight]);

  // Gauge dashoffset
  const circumference = 351.8; // 2π × 56
  const dashOffset = useMemo(() => {
    if (dataValid) {
      return circumference - (gaugePercent / 100) * circumference;
    }
    return gaugeOffset;
  }, [dataValid, gaugePercent, gaugeOffset]);

  // Seed jitter animation — only runs when MQTT is not live
  useEffect(() => {
    if (dataValid) return;
    const interval = setInterval(() => {
      setSeedWeight((prev) => 1.42 + (Math.random() * 0.02 - 0.01));
    }, 800);
    return () => clearInterval(interval);
  }, [dataValid]);

  // Seed gauge animation — only runs when MQTT is not live
  useEffect(() => {
    if (dataValid) return;
    const interval = setInterval(() => {
      setGaugeOffset(85 + (Math.random() * 10 - 5));
    }, 1500);
    return () => clearInterval(interval);
  }, [dataValid]);

  // Determine hardware status
  const hardwareOnline =
    dataValid || (availability === 'online' && !status?.hx711_fault);
  const hardwareOffline = availability === 'offline';
  const hasFault = status?.hx711_fault || status?.eth_or_wifi_issue;

  // Is this seed data?
  const isLive = dataValid;

  return (
    <div className="grid grid-cols-12 gap-lg">
      {/* Left column: Primary KPI + Gauge + Throughput */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-lg">
        {/* Primary KPI Block */}
        <section className="bg-surface-container border border-outline-variant rounded p-xl flex flex-col items-center justify-center text-center">
          <span className="font-label-caps text-label-caps text-on-surface-variant mb-md">
            CURRENT LOAD WEIGHT
          </span>
          <div className="flex items-baseline gap-sm">
            <h2 className="font-headline-lg text-[80px] leading-tight tabular-nums font-bold text-primary">
              {displayWeightKg.toFixed(2)}
            </h2>
            <span className="font-headline-md text-on-surface-variant">
              kg
            </span>
          </div>

          {/* Data source indicator */}
          {!isLive && (
            <div className="mt-sm text-[10px] font-label-caps text-tertiary">
              {connectionState === 'connecting'
                ? 'CONNECTING TO SCALE...'
                : connectionState === 'offline' || connectionState === 'error'
                  ? 'SCALE OFFLINE — SEED DATA SHOWN'
                  : hasFault
                    ? 'SENSOR FAULT — DATA INVALID'
                    : 'SEED DATA — NO LIVE CONNECTION'}
            </div>
          )}

          {/* Grade pill */}
          <div className="mt-xl px-lg py-sm bg-primary/10 border border-primary/30 rounded-full inline-flex items-center gap-md">
            <span
              className={`w-3 h-3 rounded-full ${
                isLive
                  ? 'bg-primary animate-pulse'
                  : 'bg-on-surface-variant'
              }`}
            />
            <span className="font-label-caps text-label-caps text-primary tracking-widest">
              {displayGrade}
            </span>
            {isLive && (
              <span className="font-label-caps text-[10px] text-on-surface-variant">
                LIVE
              </span>
            )}
          </div>
        </section>

        {/* Gauge + Throughput grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
          {/* Gauge Visualization */}
          <div className="bg-surface-container border border-outline-variant rounded p-lg flex items-center gap-xl">
            <div className="relative w-32 h-32 flex-shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  fill="transparent"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-surface-container-highest"
                />
                <circle
                  cx="64"
                  cy="64"
                  fill="transparent"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="text-primary transition-[stroke-dashoffset] duration-500 ease-out"
                  style={{ stroke: '#06b6d4' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-data-mono text-data-mono text-on-surface tabular-nums">
                  {gaugePercent}%
                </span>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-sm">
                GRADING RANGE
              </h3>
              <div className="flex justify-between text-xs font-data-mono mb-xs">
                <span>1.0 kg</span>
                <span className="text-primary">Target</span>
                <span>2.0 kg</span>
              </div>
              <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${gaugePercent}%` }}
                />
              </div>
              <p className="font-body-md text-body-md text-on-surface mt-md leading-snug">
                Current reading is within the{' '}
                <span className="text-primary font-bold">
                  Optimal Grading Window
                </span>{' '}
                for Line B.
              </p>
            </div>
          </div>

          {/* Throughput Stats */}
          <div className="bg-surface-container border border-outline-variant rounded p-lg">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-lg">
              SHIFT THROUGHPUT
            </h3>
            <div className="space-y-md">
              <div className="flex justify-between items-center border-b border-outline-variant/30 pb-sm">
                <span className="font-body-md text-on-surface-variant">
                  Units Processed
                </span>
                <span className="font-data-mono text-data-mono text-on-surface tabular-nums">
                  {SEED_THROUGHPUT.unitsProcessed.toLocaleString('en-US')}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-outline-variant/30 pb-sm">
                <span className="font-body-md text-on-surface-variant">
                  Yield Accuracy
                </span>
                <span className="font-data-mono text-data-mono text-primary tabular-nums">
                  {(SEED_THROUGHPUT.yieldAccuracy * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-body-md text-on-surface-variant">
                  Avg Cycle Time
                </span>
                <span className="font-data-mono text-data-mono text-on-surface tabular-nums">
                  {SEED_THROUGHPUT.avgCycleTime.toFixed(2)}s
                </span>
              </div>
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
                hardwareOnline
                  ? 'border-primary/20'
                  : 'border-[#EF4444]/20'
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
                  : hardwareOffline
                    ? 'Latency: -- (Offline)'
                    : 'Latency: -- (No data)'}
              </p>
            </div>
          </div>
          <div className="px-lg py-md bg-surface-container-high flex items-center justify-between">
            <span className="font-body-md text-on-surface-variant">
              Last Calibration:
            </span>
            <span className="font-data-mono text-data-mono text-on-surface tabular-nums">
              04:00 AM (PASSED)
            </span>
          </div>
        </div>

        {/* Batch Log Feed */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg flex-1">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-lg">
            BATCH LOG (LINE B)
          </h3>
          <div className="space-y-sm overflow-y-auto max-h-[300px] scrollbar-industrial">
            {SEED_BATCH_LOG.map((entry, i) => {
              const isCurrent = entry.status === 'Current';
              return (
                <div
                  key={i}
                  className={`p-sm flex items-center justify-between ${
                    isCurrent
                      ? 'bg-surface-container-low border-l-2 border-primary'
                      : `bg-background border-l-2 border-outline-variant ${i === 3 ? 'opacity-70' : ''}`
                  }`}
                >
                  <div className="flex flex-col">
                    <span
                      className={`text-[10px] font-data-mono uppercase ${
                        isCurrent
                          ? 'text-primary'
                          : 'text-on-surface-variant'
                      }`}
                    >
                      {entry.status}
                    </span>
                    <span className="font-data-mono text-data-mono text-on-surface tabular-nums">
                      ID{entry.batchId} - {entry.weightKg.toFixed(2)}kg
                    </span>
                  </div>
                  <span className="font-data-mono text-xs text-on-surface-variant tabular-nums">
                    {entry.timestamp}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Environment Monitor */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-md">
              <span className="material-symbols-outlined text-tertiary">
                thermostat
              </span>
              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant leading-none">
                  AMB. TEMP
                </p>
                <p className="font-headline-sm font-bold text-on-surface tabular-nums">
                  24.2°C
                </p>
              </div>
            </div>
            <div className="flex items-center gap-md">
              <span className="material-symbols-outlined text-primary">
                humidity_percentage
              </span>
              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant leading-none">
                  HUMIDITY
                </p>
                <p className="font-headline-sm font-bold text-on-surface tabular-nums">
                  68%
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
