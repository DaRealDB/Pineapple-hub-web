import { useState } from 'react';
import StatusPill from '../components/StatusPill';
import HMIPanel from '../components/HMIPanel';
import { signalStrength } from '../utils/formatters';

/**
 * Device Management screen — route: /devices
 *
 * Shows IoT device roster with live MQTT availability for Scale 04.
 * Per forge.md §4: HMIPanel for real device controls (MQTT commands + device_state).
 *
 * @param {{ mqtt: object }} props
 */
export default function DeviceManagement({ mqtt }) {
  const { connectionState, availability, deviceState, publishDeviceCommand } = mqtt;
  const [toastMessage, setToastMessage] = useState(null);

  const isLive = connectionState === 'connected';

  // Device roster — Scale 04 status comes from MQTT availability when live.
  // Other devices do not yet have MQTT presence — shown as offline.
  const devices = [
    {
      id: 'ESP32-B-4F2A',
      label: 'Scale 04',
      sublabel: 'SC-004-B',
      online: isLive && availability === 'online',
      dBm: isLive ? -54 : null,
      lastSeen: isLive ? 'Live' : 'Offline — awaiting broker',
    },
    {
      id: 'ESP32-C-8E11',
      label: 'Scale 05',
      sublabel: 'SC-005-C',
      online: false,
      dBm: null,
      lastSeen: 'Not yet provisioned',
    },
    {
      id: 'ESP32-D-9A24',
      label: 'Scale 06',
      sublabel: 'SC-006-D',
      online: false,
      dBm: null,
      lastSeen: 'Not yet provisioned',
    },
  ];

  const onlineCount = devices.filter((d) => d.online).length;
  const offlineCount = devices.filter((d) => !d.online).length;

  function handleReboot(device) {
    setToastMessage(`Rebooting ${device.label}...`);
    setTimeout(() => setToastMessage(null), 3000);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-lg">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">
            Device Management
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Active monitoring of IoT scales and sensor nodes across Grading Line B.
          </p>
        </div>
        <div className="flex gap-sm">
          <div className="flex items-center gap-xs px-sm py-1 bg-surface-container border border-outline-variant rounded">
            <div className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span className="font-label-caps text-[10px]">{onlineCount} ONLINE</span>
          </div>
          <div className="flex items-center gap-xs px-sm py-1 bg-surface-container border border-outline-variant rounded">
            <div className="w-2 h-2 rounded-full bg-[#EF4444]" />
            <span className="font-label-caps text-[10px]">{offlineCount} OFFLINE</span>
          </div>
        </div>
      </div>

      {/* Device Table */}
      <div className="bg-surface-container border border-outline-variant overflow-hidden rounded">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-high border-b border-outline-variant">
                <th className="px-lg py-md font-label-caps text-label-caps text-on-surface-variant">
                  DEVICE IDENTITY
                </th>
                <th className="px-lg py-md font-label-caps text-label-caps text-on-surface-variant text-center">
                  STATUS
                </th>
                <th className="px-lg py-md font-label-caps text-label-caps text-on-surface-variant">
                  SIGNAL STRENGTH (RSSI)
                </th>
                <th className="px-lg py-md font-label-caps text-label-caps text-on-surface-variant">
                  LAST SEEN
                </th>
                <th className="px-lg py-md font-label-caps text-label-caps text-on-surface-variant text-right">
                  OPERATIONS
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {devices.map((device) => {
                const sig = signalStrength(device.dBm);
                const isOnline = device.online;

                return (
                  <tr key={device.id} className="hover:bg-surface-container-low transition-colors group">
                    <td className="px-lg py-md">
                      <div className="flex items-center gap-md">
                        <div className={`p-2 rounded ${isOnline ? 'bg-secondary-container/20' : 'bg-error-container/20'}`}>
                          <span className={`material-symbols-outlined ${isOnline ? 'text-primary' : 'text-error'}`}>
                            memory
                          </span>
                        </div>
                        <div>
                          <p className="font-headline-sm text-[16px] text-on-surface">{device.label}</p>
                          <p className="font-data-mono text-[11px] text-on-surface-variant">{device.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-lg py-md text-center">
                      <StatusPill
                        variant={isOnline ? 'online' : 'offline'}
                        label={isOnline ? 'Online' : 'Offline'}
                      />
                    </td>
                    <td className="px-lg py-md">
                      <div className="w-full max-w-[120px]">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-data-mono text-[10px] text-on-surface-variant">
                            {isOnline ? `${device.dBm} dBm` : '-- dBm'}
                          </span>
                          <span className={`font-data-mono text-[10px] ${isOnline ? (sig.bars >= 4 ? 'text-primary' : 'text-on-tertiary') : 'text-error'}`}>
                            {isOnline ? sig.label : 'No Signal'}
                          </span>
                        </div>
                        <div className="flex gap-0.5 h-1.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className={`flex-1 rounded-full ${isOnline ? (i < sig.bars ? 'bg-primary' : 'bg-surface-variant') : 'bg-surface-variant'}`} />
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className={`px-lg py-md font-data-mono text-data-mono tabular-nums ${isOnline ? 'text-on-surface' : 'text-error'}`}>
                      {device.lastSeen}
                    </td>
                    <td className="px-lg py-md text-right">
                      <button
                        onClick={() => handleReboot(device)}
                        disabled={!isOnline}
                        className="inline-flex items-center gap-xs px-md py-1.5 bg-surface-variant text-on-surface hover:bg-primary hover:text-on-primary-container transition-all font-label-caps text-[11px] rounded uppercase disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                        Reboot
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-lg py-md bg-surface-container border-t border-outline-variant flex justify-between items-center">
          <p className="font-label-caps text-[10px] text-on-surface-variant">
            TOTAL DEVICES: {devices.length.toString().padStart(2, '0')} LISTED
            {' | '} {isLive ? 'MQTT CONNECTED' : 'MQTT OFFLINE'}
          </p>
        </div>
      </div>

      {/* Diagnostic Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
        <StatCard icon="memory" label="SYSTEM LOAD" value="--" unit="" sublabel="Awaiting telemetry" />
        <StatCard icon="pulse_alert" label="LATENCY" value="--" unit="" sublabel={isLive ? 'Awaiting data' : 'MQTT offline'} />
        <StatCard icon="history" label="LOG EVENTS" value="--" unit="" sublabel="No events yet" />
      </div>

      {/* HMI Panel (forge.md §4) */}
      <HMIPanel
        deviceState={deviceState}
        publishDeviceCommand={publishDeviceCommand}
        isLive={isLive}
      />

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-lg right-lg z-[100] pointer-events-none">
          <div className="pointer-events-auto bg-surface-container border-l-4 border-primary p-md shadow-lg flex items-center gap-md min-w-[320px] mb-sm animate-pulse">
            <span className="material-symbols-outlined text-primary">restart_alt</span>
            <div>
              <p className="font-label-caps text-[12px] text-primary">COMMAND ISSUED</p>
              <p className="font-body-md text-[13px] text-on-surface">{toastMessage}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Simple diagnostic stat card. */
function StatCard({ icon, label, value, unit, sublabel }) {
  return (
    <div className="bg-surface-container border border-outline-variant p-lg rounded relative overflow-hidden group">
      <div className="relative z-10">
        <h4 className="font-label-caps text-label-caps text-on-surface-variant mb-md">{label}</h4>
        <div className="flex items-end gap-sm mb-sm">
          <span className="font-data-mono text-[28px] text-on-surface-variant/30 tabular-nums">{value}</span>
          {unit && <span className="font-label-caps text-[10px] text-on-surface-variant/30 mb-1">{unit}</span>}
        </div>
        <p className="font-body-md text-[11px] text-on-surface-variant/50 italic">{sublabel}</p>
      </div>
      <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none transition-transform duration-500 group-hover:scale-110">
        <span className="material-symbols-outlined text-[120px]">{icon}</span>
      </div>
    </div>
  );
}
