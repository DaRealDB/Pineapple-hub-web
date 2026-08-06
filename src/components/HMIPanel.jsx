import { useState, useEffect, useRef } from 'react';
import StatusPill from './StatusPill';
import { useAuth } from '../context/AuthContext';
import { PERM } from '../constants/permissions';

const TIMEOUT_MS = 5000;

/**
 * HMI Panel — replaces the placeholder SwitchPanel with real device controls.
 * Each button publishes a command over MQTT and waits for device_state confirmation.
 *
 * RBAC: employees see nothing; supervisors see all controls; admins see all controls.
 */
export default function HMIPanel({ deviceState, publishDeviceCommand, isLive }) {
  const { hasPermission } = useAuth();

  const canControl = hasPermission(PERM.HMI_CONTROL);
  const canLogTrigger = hasPermission(PERM.HMI_LOG_TRIGGER);

  // Hide entire panel from employees
  if (!canControl && !canLogTrigger) {
    return null;
  }

  return (
    <div className="bg-surface-container border border-outline-variant rounded p-lg">
      <div className="flex items-center justify-between mb-lg">
        <h3 className="font-label-caps text-label-caps text-on-surface-variant">
          DEVICE CONTROLS — SCALE 04
        </h3>
        <StatusPill
          variant={isLive ? 'online' : 'offline'}
          label={isLive ? 'MQTT LIVE' : 'MQTT OFFLINE'}
        />
      </div>

      <div className="grid grid-cols-2 gap-sm">
        {canControl && (
          <>
            <HMIButton
              label="POWER"
              icon="power_settings_new"
              action="power"
              currentState={deviceState?.power}
              publish={publishDeviceCommand}
              isLive={isLive}
              onLabel="ON"
              offLabel="OFF"
            />
            <HMIButton
              label="TARE"
              icon="scale"
              action="tare"
              currentState={deviceState?.tare ? 'on' : 'off'}
              publish={publishDeviceCommand}
              isLive={isLive}
              isMomentary
            />
            <HMIButton
              label="MODE"
              icon="tune"
              action="mode"
              currentState={deviceState?.mode || 'auto'}
              publish={publishDeviceCommand}
              isLive={isLive}
              displayValue={deviceState?.mode || 'AUTO'}
            />
          </>
        )}
        {canLogTrigger && (
          <HMIButton
            label="LOG TRIGGER"
            icon="note_add"
            action="log_trigger"
            currentState={null}
            publish={publishDeviceCommand}
            isLive={isLive}
            isMomentary
          />
        )}
      </div>

      <p className="font-body-md text-[11px] text-on-surface-variant/50 mt-md text-center">
        Commands are sent over MQTT and confirmed via device_state
      </p>
    </div>
  );
}

/**
 * Single HMI button with pending/timeout state.
 */
function HMIButton({
  label, icon, action, currentState, publish, isLive,
  isMomentary = false, onLabel = 'ON', offLabel = 'OFF', displayValue,
}) {
  const [pending, setPending] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const prevState = useRef(currentState);
  const timeoutRef = useRef(null);

  // Clear pending when device state changes
  useEffect(() => {
    if (pending && currentState !== prevState.current) {
      setPending(false);
      setTimedOut(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    prevState.current = currentState;
  }, [currentState, pending]);

  function handleClick() {
    if (!isLive || pending) return;
    setPending(true);
    setTimedOut(false);
    publish(action);

    timeoutRef.current = setTimeout(() => {
      setPending(false);
      setTimedOut(true);
    }, TIMEOUT_MS);
  }

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const isActive = currentState === 'on' || currentState === true;

  return (
    <button
      onClick={handleClick}
      disabled={!isLive || pending}
      className={`flex flex-col items-center gap-xs p-md rounded border transition-all
        ${isActive && !isMomentary
          ? 'bg-[#10B981]/10 border-[#10B981]/30'
          : 'bg-surface-container-low border-outline-variant hover:border-primary/50'
        }
        ${timedOut ? 'border-[#EF4444]/50 bg-[#EF4444]/5' : ''}
        ${pending ? 'border-tertiary/50 animate-pulse' : ''}
        disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      <span className={`material-symbols-outlined text-2xl ${
        timedOut ? 'text-[#EF4444]' : isActive ? 'text-[#10B981]' : 'text-on-surface-variant'
      }`}>
        {icon}
      </span>
      <span className="font-label-caps text-[10px] text-on-surface-variant">{label}</span>
      {pending ? (
        <StatusPill variant="pending" label="PENDING" />
      ) : timedOut ? (
        <StatusPill variant="offline" label="TIMEOUT" />
      ) : isMomentary ? (
        <span className="font-data-mono text-xs text-on-surface-variant">PRESS</span>
      ) : (
        <span className={`font-data-mono text-xs ${isActive ? 'text-[#10B981]' : 'text-on-surface-variant'}`}>
          {displayValue || (isActive ? onLabel : offLabel)}
        </span>
      )}
    </button>
  );
}
