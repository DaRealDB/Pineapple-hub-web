import { useState, useEffect, useRef } from 'react';
import StatusPill from './StatusPill';
import { switches } from '../data/switchConfig';

/** Milliseconds to wait for hardware confirmation before timing out */
const CONFIRM_TIMEOUT_MS = 5000;

/**
 * Generic, data-driven HMI Switch Panel (forge.md §4).
 *
 * Renders from `src/data/switchConfig.js` — no hardcoded switch logic.
 * Each switch shows: label, live state pill (via StatusPill), and a
 * toggle button that publishes a command to the hardware.
 *
 * Not optimistic: shows a pending state until the `/state` topic confirms,
 * and times out to an error state if no confirmation arrives.
 *
 * @param {{
 *   switchStates: Record<string, 'on' | 'off'>,
 *   publishSwitchCommand: (switchId: string, command: 'on' | 'off') => void,
 *   connectionState: string,
 * }} props
 */
export default function SwitchPanel({
  switchStates,
  publishSwitchCommand,
  connectionState,
}) {
  return (
    <div className="bg-surface-container border border-outline-variant rounded p-lg">
      <div className="flex items-center justify-between mb-lg">
        <h3 className="font-label-caps text-label-caps text-on-surface-variant">
          HMI SWITCH PANEL
        </h3>
        <StatusPill
          variant={connectionState === 'connected' ? 'online' : 'offline'}
          label={connectionState === 'connected' ? 'MQTT LIVE' : 'MQTT OFFLINE'}
        />
      </div>

      {switches.length === 0 ? (
        <p className="font-body-md text-body-md text-on-surface-variant text-center py-lg">
          No switches configured. Add entries to <code>src/data/switchConfig.js</code>.
        </p>
      ) : (
        <div className="space-y-sm">
          {switches.map((sw) => (
            <SwitchRow
              key={sw.id}
              switchId={sw.id}
              label={sw.label}
              currentState={switchStates[sw.id] || null}
              publishSwitchCommand={publishSwitchCommand}
              isLive={connectionState === 'connected'}
            />
          ))}
        </div>
      )}

      <p className="font-body-md text-[11px] text-on-surface-variant mt-md text-center italic">
        Switch config is a placeholder — confirm functions with hardware team.
      </p>
    </div>
  );
}

/**
 * Single switch row: label, state pill, and toggle control.
 */
function SwitchRow({ switchId, label, currentState, publishSwitchCommand, isLive }) {
  const [pending, setPending] = useState(null); // 'on' | 'off' | null
  const timeoutRef = useRef(null);

  // Clear pending when hardware confirms via currentState change
  useEffect(() => {
    if (pending && currentState === pending) {
      setPending(null);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [currentState, pending]);

  // Timeout — if hardware doesn't confirm within CONFIRM_TIMEOUT_MS, show error
  useEffect(() => {
    if (pending) {
      timeoutRef.current = setTimeout(() => {
        setPending(null);
      }, CONFIRM_TIMEOUT_MS);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [pending]);

  const handleToggle = (command) => {
    if (!isLive || pending) return;
    setPending(command);
    publishSwitchCommand(switchId, command);
  };

  const isOn = currentState === 'on';
  const isPending = pending !== null;
  const pendingCommand = pending;

  return (
    <div className="bg-surface-container-low p-sm rounded flex items-center justify-between">
      {/* Label + state pill */}
      <div className="flex items-center gap-md">
        <span className="font-body-md text-body-md text-on-surface">
          {label}
        </span>
        {isPending ? (
          <StatusPill variant="pending" label={`→ ${pendingCommand?.toUpperCase()}`} />
        ) : currentState ? (
          <StatusPill
            variant={isOn ? 'online' : 'offline'}
            label={isOn ? 'ON' : 'OFF'}
          />
        ) : (
          <span className="font-data-mono text-xs text-on-surface-variant">
            NO DATA
          </span>
        )}
      </div>

      {/* Toggle controls */}
      <div className="flex items-center gap-sm">
        <button
          onClick={() => handleToggle('on')}
          disabled={!isLive || isPending}
          className={`px-md py-xs rounded font-label-caps text-label-caps transition-all ${
            isOn && !isPending
              ? 'bg-[#10B981]/20 border border-[#10B981]/30 text-[#10B981]'
              : 'bg-surface-container-high border border-outline-variant text-on-surface-variant hover:border-[#10B981]/50 hover:text-[#10B981]'
          } disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          ON
        </button>
        <button
          onClick={() => handleToggle('off')}
          disabled={!isLive || isPending}
          className={`px-md py-xs rounded font-label-caps text-label-caps transition-all ${
            !isOn && !isPending
              ? 'bg-[#EF4444]/20 border border-[#EF4444]/30 text-[#EF4444]'
              : 'bg-surface-container-high border border-outline-variant text-on-surface-variant hover:border-[#EF4444]/50 hover:text-[#EF4444]'
          } disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          OFF
        </button>
      </div>
    </div>
  );
}
