import { useState } from 'react';
import StatusPill from '../components/StatusPill';
import { signalStrength } from '../utils/formatters';
import { SEED_DEVICES } from '../data/mockData';

/**
 * Device Management screen — route: /devices
 * Reference: stitch_bukidnon_pineapple_operations_hub/device_center_iot_health/code.html
 *
 * Per BUILD_SPEC.md Screen: Device Management.
 * Scale row status derives from MQTT availability topic when connected.
 *
 * @param {{ mqtt: object }} props
 */
export default function DeviceManagement({ mqtt }) {
  const { connectionState, availability } = mqtt;
  const [toastMessage, setToastMessage] = useState(null);

  const isLive = connectionState === 'connected';

  // Merge MQTT availability into device roster.
  // Scale 04 (ESP32-B-4F2A) gets its online status from the availability topic.
  const devices = SEED_DEVICES.map((d) => {
    if (d.id === 'ESP32-B-4F2A' && availability) {
      return { ...d, online: availability === 'online' };
    }
    return d;
  });

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
            Active monitoring of IoT scales and sensor nodes across Grading
            Line B.
          </p>
        </div>
        <div className="flex gap-sm">
          <div className="flex items-center gap-xs px-sm py-1 bg-surface-container border border-outline-variant rounded">
            <div className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span className="font-label-caps text-[10px]">
              {onlineCount} ONLINE
            </span>
          </div>
          <div className="flex items-center gap-xs px-sm py-1 bg-surface-container border border-outline-variant rounded">
            <div className="w-2 h-2 rounded-full bg-[#EF4444]" />
            <span className="font-label-caps text-[10px]">
              {offlineCount} OFFLINE
            </span>
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
                  <tr
                    key={device.id}
                    className="hover:bg-surface-container-low transition-colors group"
                  >
                    {/* Device Identity */}
                    <td className="px-lg py-md">
                      <div className="flex items-center gap-md">
                        <div
                          className={`p-2 rounded ${
                            isOnline
                              ? 'bg-secondary-container/20'
                              : 'bg-error-container/20'
                          }`}
                        >
                          <span
                            className={`material-symbols-outlined ${
                              isOnline ? 'text-primary' : 'text-error'
                            }`}
                          >
                            memory
                          </span>
                        </div>
                        <div>
                          <p className="font-headline-sm text-[16px] text-on-surface">
                            {device.label}
                          </p>
                          <p className="font-data-mono text-[11px] text-on-surface-variant">
                            {device.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-lg py-md text-center">
                      <StatusPill
                        variant={isOnline ? 'online' : 'offline'}
                        label={isOnline ? 'Online' : 'Offline'}
                      />
                    </td>

                    {/* Signal Strength */}
                    <td className="px-lg py-md">
                      <div className="w-full max-w-[120px]">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-data-mono text-[10px] text-on-surface-variant">
                            {isOnline
                              ? `${device.dBm} dBm`
                              : '-- dBm'}
                          </span>
                          <span
                            className={`font-data-mono text-[10px] ${
                              isOnline
                                ? sig.bars >= 4
                                  ? 'text-primary'
                                  : 'text-on-tertiary'
                                : 'text-error'
                            }`}
                          >
                            {isOnline ? sig.label : 'No Signal'}
                          </span>
                        </div>
                        <div className="flex gap-0.5 h-1.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div
                              key={i}
                              className={`flex-1 rounded-full ${
                                isOnline
                                  ? i < sig.bars
                                    ? 'bg-primary'
                                    : 'bg-surface-variant'
                                  : 'bg-surface-variant'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </td>

                    {/* Last Seen */}
                    <td
                      className={`px-lg py-md font-data-mono text-data-mono tabular-nums ${
                        isOnline ? 'text-on-surface' : 'text-error'
                      }`}
                    >
                      {device.lastSeen}
                    </td>

                    {/* Operations */}
                    <td className="px-lg py-md text-right">
                      <button
                        onClick={() => handleReboot(device)}
                        className="inline-flex items-center gap-xs px-md py-1.5 bg-surface-variant text-on-surface hover:bg-primary hover:text-on-primary-container transition-all font-label-caps text-[11px] rounded uppercase"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          restart_alt
                        </span>
                        Reboot
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="px-lg py-md bg-surface-container border-t border-outline-variant flex justify-between items-center">
          <p className="font-label-caps text-[10px] text-on-surface-variant">
            TOTAL DEVICES: {devices.length.toString().padStart(2, '0')} LISTED
            {' | '}
            SYSTEM UPTIME: 14D 02H
          </p>
          <div className="flex gap-xs">
            <button className="w-8 h-8 flex items-center justify-center border border-outline-variant rounded hover:bg-surface-container-high transition-colors text-on-surface-variant">
              <span className="material-symbols-outlined text-sm">
                chevron_left
              </span>
            </button>
            <button className="w-8 h-8 flex items-center justify-center border border-primary bg-primary-container/20 rounded text-primary font-data-mono text-xs">
              1
            </button>
            <button className="w-8 h-8 flex items-center justify-center border border-outline-variant rounded hover:bg-surface-container-high transition-colors text-on-surface-variant">
              <span className="material-symbols-outlined text-sm">
                chevron_right
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Diagnostic Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
        {/* System Load */}
        <div className="bg-surface-container border border-outline-variant p-lg rounded relative overflow-hidden group">
          <div className="relative z-10">
            <h4 className="font-label-caps text-label-caps text-on-surface-variant mb-md">
              SYSTEM LOAD
            </h4>
            <div className="flex items-end gap-sm mb-sm">
              <span className="font-data-mono text-[28px] text-primary tabular-nums">
                42%
              </span>
              <span className="font-label-caps text-[10px] text-on-surface-variant mb-1">
                AGGREGATE
              </span>
            </div>
            <div className="w-full bg-surface-variant h-1 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full w-[42%]"
                style={{
                  transition: 'width 2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none transition-transform duration-500 group-hover:scale-110">
            <span className="material-symbols-outlined text-[120px]">
              memory
            </span>
          </div>
        </div>

        {/* Latency */}
        <div className="bg-surface-container border border-outline-variant p-lg rounded relative overflow-hidden group">
          <div className="relative z-10">
            <h4 className="font-label-caps text-label-caps text-on-surface-variant mb-md">
              LATENCY
            </h4>
            <div className="flex items-end gap-sm mb-sm">
              <span className="font-data-mono text-[28px] text-[#10B981] tabular-nums">
                3ms
              </span>
              <span className="font-label-caps text-[10px] text-on-surface-variant mb-1">
                MQTT BROKER
              </span>
            </div>
            <div className="flex gap-1 items-end h-8">
              {[20, 30, 25, 45, 60, 15, 40].map((h, i) => (
                <div
                  key={i}
                  className={`w-1 ${
                    i === 4 ? 'bg-[#10B981]' : 'bg-[#10B981]/40'
                  }`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none transition-transform duration-500 group-hover:scale-110">
            <span className="material-symbols-outlined text-[120px]">
              pulse_alert
            </span>
          </div>
        </div>

        {/* Log Events */}
        <div className="bg-surface-container border border-outline-variant p-lg rounded relative overflow-hidden group">
          <div className="relative z-10">
            <h4 className="font-label-caps text-label-caps text-on-surface-variant mb-md">
              LOG EVENTS
            </h4>
            <div className="flex items-end gap-sm mb-sm">
              <span className="font-data-mono text-[28px] text-on-surface tabular-nums">
                1,284
              </span>
              <span className="font-label-caps text-[10px] text-on-surface-variant mb-1">
                LAST HOUR
              </span>
            </div>
            <p className="font-body-md text-[11px] text-on-surface-variant italic">
              All packets successfully acknowledged by gateway.
            </p>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none transition-transform duration-500 group-hover:scale-110">
            <span className="material-symbols-outlined text-[120px]">
              history
            </span>
          </div>
        </div>
      </div>

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-lg right-lg z-[100] pointer-events-none">
          <div className="pointer-events-auto bg-surface-container border-l-4 border-primary p-md shadow-lg flex items-center gap-md min-w-[320px] mb-sm animate-pulse">
            <span className="material-symbols-outlined text-primary">
              restart_alt
            </span>
            <div>
              <p className="font-label-caps text-[12px] text-primary">
                COMMAND ISSUED
              </p>
              <p className="font-body-md text-[13px] text-on-surface">
                {toastMessage}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
