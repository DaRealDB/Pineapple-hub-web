import { useState, useEffect, useRef } from 'react';
import StatusPill from './StatusPill';
import { useAuth } from '../context/AuthContext';
import { PERM } from '../constants/permissions';

const TIMEOUT_MS = 5000;
const card = 'bg-surface-container border border-outline-variant rounded p-lg';
const cardTitle = 'font-label-caps text-label-caps text-on-surface-variant';

/**
 * HMI Panel — industrial control tiles for Scale 04.
 * Consistent styling: active=primary highlight, inactive=neutral, error=red.
 */
export default function HMIPanel({ deviceState, publishDeviceCommand, isLive, crateState, publishLogTrigger }) {
  const { hasPermission } = useAuth();
  const canControl = hasPermission(PERM.HMI_CONTROL);
  const canLogTrigger = hasPermission(PERM.HMI_LOG_TRIGGER);

  if (!canControl && !canLogTrigger) return null;

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-md">
        <h3 className={cardTitle}>DEVICE CONTROLS — SCALE 04</h3>
        <StatusPill variant={isLive ? 'online' : 'offline'} label={isLive ? 'MQTT LIVE' : 'MQTT OFFLINE'} />
      </div>

      <div className="grid grid-cols-2 gap-sm">
        {canControl && (
          <>
            <ControlTile
              label="POWER"
              icon="power_settings_new"
              action="power"
              currentState={deviceState?.power}
              publish={publishDeviceCommand}
              isLive={isLive}
              onLabel="ON"
              offLabel="OFF"
            />
            <ControlTile
              label="TARE"
              icon="scale"
              action="tare"
              currentState={deviceState?.tare_count ?? 0}
              publish={publishDeviceCommand}
              isLive={isLive}
              isMomentary
            />
            <ControlTile
              label="MODE"
              icon="tune"
              action="mode"
              currentState={deviceState?.mode || 'auto'}
              publish={publishDeviceCommand}
              isLive={isLive}
              displayValue={deviceState?.mode || 'g'}
            />
          </>
        )}
        {canLogTrigger && (
          <ControlTile
            label="LOG TRIGGER"
            icon="note_add"
            action="log_trigger"
            currentState={deviceState?.log_trigger_count ?? 0}
            publish={publishLogTrigger || publishDeviceCommand}
            isLive={isLive}
            isMomentary
            crateState={crateState}
          />
        )}
      </div>
    </div>
  );
}

// ── Control Tile ──────────────────────────────────────────────────────

function ControlTile({
  label, icon, action, currentState, publish, isLive,
  isMomentary = false, onLabel = 'ON', offLabel = 'OFF', displayValue,
  crateState = null,
}) {
  const [pending, setPending] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const prevState = useRef(currentState);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (pending && currentState !== prevState.current) {
      setPending(false);
      setTimedOut(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    prevState.current = currentState;
  }, [currentState, pending]);

  async function handleClick() {
    if (!isLive || pending) return;
    setPending(true);
    setTimedOut(false);
    setFeedback(null);

    try {
      const result = await publish(action);
      if (result?.ocr_result) {
        if (result.ocr_result.success) {
          setFeedback({ type: 'success', text: `LOGGED: ${result.ocr_result.batch_id || 'OK'}` });
          setPending(false);
        } else {
          const reason = result.ocr_result.reason === 'not_ready'
            ? `NEED: ${(result.ocr_result.missing || []).join(', ') || 'DATA'}`
            : (result.ocr_result.reason || 'FAILED');
          setFeedback({ type: 'error', text: reason });
          setTimedOut(true);
          setPending(false);
        }
        setTimeout(() => setFeedback(null), 4000);
        return;
      }
    } catch {
      // Fall through to timeout
    }

    timeoutRef.current = setTimeout(() => {
      setPending(false);
      setTimedOut(true);
    }, TIMEOUT_MS);
  }

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const isActive = currentState === 'on' || currentState === true;
  const isError = timedOut;

  return (
    <button
      onClick={handleClick}
      disabled={!isLive || pending}
      className={`flex flex-col items-center gap-1 p-md rounded-lg border transition-all select-none
        ${isActive && !isMomentary
          ? 'bg-primary/10 border-primary/40'
          : 'bg-surface-container-low border-outline-variant hover:border-primary/40'
        }
        ${isError ? 'border-[#EF4444]/50 bg-[#EF4444]/5' : ''}
        ${pending ? 'border-primary/50 animate-pulse' : ''}
        disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {/* Icon */}
      <span className={`material-symbols-outlined text-xl ${
        isError ? 'text-[#EF4444]' : isActive && !isMomentary ? 'text-primary' : 'text-on-surface-variant'
      }`}>
        {icon}
      </span>

      {/* Label */}
      <span className="font-label-caps text-[10px] text-on-surface-variant">{label}</span>

      {/* State line */}
      {feedback ? (
        <span className={`font-data-mono text-[10px] leading-tight text-center ${feedback.type === 'success' ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
          {feedback.text}
        </span>
      ) : pending ? (
        <StatusPill variant="pending" label="PENDING" />
      ) : isError ? (
        <StatusPill variant="offline" label="TIMEOUT" />
      ) : isMomentary ? (
        <>
          {action === 'log_trigger' && crateState ? (
            <span className={`font-data-mono text-[10px] ${
              crateState.state === 'READY' ? 'text-[#10B981]' : crateState.state === 'AWAITING_DATA' ? 'text-[#F59E0B]' : 'text-on-surface-variant/50'
            }`}>
              {crateState.state === 'READY' ? 'READY' : crateState.state === 'AWAITING_DATA' ? 'PARTIAL' : 'IDLE'}
            </span>
          ) : (
            <span className="font-data-mono text-[10px] text-on-surface-variant/50">PRESS</span>
          )}
        </>
      ) : (
        <span className={`font-data-mono text-xs ${isActive ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
          {displayValue || (isActive ? onLabel : offLabel)}
        </span>
      )}
    </button>
  );
}
