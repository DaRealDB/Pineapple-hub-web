import { useState, useEffect, useRef, useCallback } from 'react';
import mqtt from 'mqtt';

/**
 * MQTT connection states.
 * @typedef {'connecting' | 'connected' | 'offline' | 'error'} MqttConnectionState
 */

/**
 * Hook: connects to the Aedes MQTT broker via WebSocket, subscribes to
 * pineapple/scale1/#, and exposes live telemetry + connection state to
 * consuming components.
 *
 * Per README.md MQTT contract:
 *   - pineapple/scale1/availability (retained, QoS 1): "online" | "offline"
 *   - pineapple/scale1/data (not retained, QoS 1): JSON { weight_g, status, grade, ts }
 *
 * Never-fallback rule: if status.hx711_fault or status.eth_or_wifi_issue
 * is true, data is marked invalid and consuming components must show the
 * fault state — never a stale/frozen number.
 */
export default function useMqtt() {
  const brokerUrl = import.meta.env.VITE_MQTT_WS_URL;
  
  // Validate MQTT URL
  if (!brokerUrl) {
    console.error('[MQTT] VITE_MQTT_WS_URL not configured');
    return {
      connectionState: 'error',
      availability: null,
      weightG: null,
      grade: null,
      status: null,
      ts: null,
      dataValid: false,
    };
  }
  
  if (!brokerUrl.startsWith('ws://') && !brokerUrl.startsWith('wss://')) {
    console.error('[MQTT] Invalid MQTT URL format');
    return {
      connectionState: 'error',
      availability: null,
      weightG: null,
      grade: null,
      status: null,
      ts: null,
      dataValid: false,
    };
  }

  const clientRef = useRef(null);

  const [connectionState, setConnectionState] = useState(
    /** @type {MqttConnectionState} */ ('connecting')
  );
  const [availability, setAvailability] = useState(
    /** @type {'online' | 'offline' | null} */ (null)
  );
  const [weightG, setWeightG] = useState(
    /** @type {number | null} */ (null)
  );
  const [grade, setGrade] = useState(
    /** @type {string | null} */ (null)
  );
  const [status, setStatus] = useState(
    /** @type {{ hx711_fault: boolean, eth_or_wifi_issue: boolean } | null} */ (null)
  );
  const [ts, setTs] = useState(
    /** @type {number | null} */ (null)
  );

  /** Whether the current weight/grade reading should be treated as valid live data. */
  const dataValid =
    connectionState === 'connected' &&
    availability === 'online' &&
    status !== null &&
    !status.hx711_fault &&
    !status.eth_or_wifi_issue;

  const handleConnect = useCallback(() => {
    setConnectionState('connected');
  }, []);

  const handleClose = useCallback(() => {
    setConnectionState('offline');
    setAvailability('offline');
  }, []);

  const handleError = useCallback((err) => {
    console.error('[MQTT] Error:', err);
    setConnectionState('error');
  }, []);

  const handleMessage = useCallback((topic, payload) => {
    try {
      const str = payload.toString();

      if (topic === 'pineapple/scale1/availability') {
        const availabilityValue = str === 'online' ? 'online' : 'offline';
        setAvailability(availabilityValue);
        return;
      }

      if (topic === 'pineapple/scale1/data') {
        const data = JSON.parse(str);

        // Validate and sanitize data
        setWeightG(
          typeof data.weight_g === 'number' && data.weight_g >= 0 && data.weight_g <= 10000 
            ? data.weight_g 
            : null
        );
        setGrade(
          typeof data.grade === 'string' && ['light', 'grade_1', 'heavy', 'invalid'].includes(data.grade)
            ? data.grade 
            : null
        );
        setStatus(
          data.status &&
          typeof data.status.hx711_fault === 'boolean' &&
          typeof data.status.eth_or_wifi_issue === 'boolean'
            ? {
                hx711_fault: data.status.hx711_fault,
                eth_or_wifi_issue: data.status.eth_or_wifi_issue,
              }
            : null
        );
        setTs(typeof data.ts === 'number' ? data.ts : null);
      }
    } catch (e) {
      console.error('[MQTT] Failed to parse message:', e);
    }
  }, []);

  useEffect(() => {
    const client = mqtt.connect(brokerUrl, {
      protocol: 'ws',
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      keepalive: 10,
    });

    clientRef.current = client;

    client.on('connect', () => {
      handleConnect();
      client.subscribe('pineapple/scale1/#', { qos: 1 }, (err) => {
        if (err) {
          console.error('[MQTT] Subscribe error:', err);
        }
      });
    });

    client.on('close', handleClose);
    client.on('error', handleError);
    client.on('message', handleMessage);

    return () => {
      if (clientRef.current) {
        clientRef.current.end(true);
      }
    };
  }, [brokerUrl, handleConnect, handleClose, handleError, handleMessage]);

  return {
    /** @type {MqttConnectionState} */
    connectionState,
    /** @type {'online' | 'offline' | null} */
    availability,
    /** Raw weight in grams from firmware, or null. Convert to kg for display. */
    weightG,
    /** Raw grade string from firmware: "light" | "grade_1" | "heavy" | "invalid" | null */
    grade,
    /** Sensor/network fault booleans, or null if never received. */
    status,
    /** Free-running millis() counter from firmware — livelock detection only. */
    ts,
    /** True when connected, online, and no sensor/network faults. */
    dataValid,
  };
}
