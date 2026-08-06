import { useState, useEffect, useRef, useCallback } from 'react';
import mqtt from 'mqtt';
import {
  TOPIC_SCALE1_WILDCARD,
  TOPIC_SCALE1_AVAILABILITY,
  TOPIC_SCALE1_DATA,
  TOPIC_VISION_ZONE1,
  TOPIC_VISION_ZONE2,
  TOPIC_HMI_STATE_WILDCARD,
  TOPIC_SCALE1_DEVICE_STATE,
  hmiSetTopic,
  deviceCommandTopic,
} from '../constants/mqttTopics';

/**
 * MQTT connection states.
 * @typedef {'connecting' | 'connected' | 'offline' | 'error'} MqttConnectionState
 */

/**
 * Hook: connects to the Aedes MQTT broker via WebSocket, subscribes to
 * scale telemetry, vision zones, and HMI switch states. Exposes live
 * telemetry + derived validity + connection state to consuming components.
 *
 * Per forge.md topic contracts:
 *   - pineapple/scale1/availability (retained, QoS 1): "online" | "offline"
 *   - pineapple/scale1/data (not retained, QoS 1): JSON { weight_g, grade, status, ts }
 *   - pineapple/vision/zone1 (not retained, QoS 1): "occupied" | "clear"
 *   - pineapple/vision/zone2 (not retained, QoS 1): "occupied" | "clear"
 *   - pineapple/hmi/{switchId}/state (not retained, QoS 1): "on" | "off"
 *
 * Never-fallback rule: if status.hx711_fault or status.eth_or_wifi_issue
 * is true, OR Zone 1 is occupied, data is marked invalid and consuming
 * components must show the fault state — never a stale/frozen number.
 */
export default function useMqtt() {
  const brokerUrl =
    import.meta.env.VITE_MQTT_WS_URL || 'ws://192.168.1.10:9001';

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

  /* ── AI camera zone state (forge.md §3) ── */
  const [zone1, setZone1] = useState(
    /** @type {'occupied' | 'clear' | null} */ (null)
  );
  const [zone2, setZone2] = useState(
    /** @type {'occupied' | 'clear' | null} */ (null)
  );

  /* ── HMI switch state mirror (forge.md §4) ── */
  const [switchStates, setSwitchStates] = useState(
    /** @type {Record<string, 'on' | 'off'>} */ ({})
  );

  /* ── Device state for HMI confirmation ── */
  const [deviceState, setDeviceState] = useState(
    /** @type {{ power?: 'on'|'off', mode?: string, tare?: boolean } | null} */ (null)
  );

  /**
   * Whether the current weight/grade reading should be treated as valid
   * live data. Combines: MQTT connected + scale online + no HX711 fault +
   * no network issue + Zone 1 clear (forklift not in scale area).
   *
   * Zone 1 gating reuses the existing fault-state pattern per forge.md §3:
   * while occupied, weight is treated exactly like hx711_fault — invalid.
   */
  const dataValid =
    connectionState === 'connected' &&
    availability === 'online' &&
    status !== null &&
    !status.hx711_fault &&
    !status.eth_or_wifi_issue &&
    zone1 !== 'occupied';

  /**
   * Whether the capture sequence is armed (Zone 2 occupied).
   * Per forge.md §3: Zone 2 presence starts the crate capture sequence.
   */
  const captureArmed = zone2 === 'occupied';

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
    const str = payload.toString();

    /* ── Scale telemetry ── */
    if (topic === TOPIC_SCALE1_AVAILABILITY) {
      setAvailability(str === 'online' ? 'online' : 'offline');
      return;
    }

    if (topic === TOPIC_SCALE1_DATA) {
      try {
        const data = JSON.parse(str);

        setWeightG(
          typeof data.weight_g === 'number' ? data.weight_g : null
        );
        setGrade(
          typeof data.grade === 'string' ? data.grade : null
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
      } catch (e) {
        console.error('[MQTT] Failed to parse data payload:', e);
      }
      return;
    }

    /* ── Vision zones (forge.md §3) ── */
    if (topic === TOPIC_VISION_ZONE1) {
      setZone1(str === 'occupied' ? 'occupied' : 'clear');
      return;
    }

    if (topic === TOPIC_VISION_ZONE2) {
      setZone2(str === 'occupied' ? 'occupied' : 'clear');
      return;
    }

    /* ── Device state (Part 3: HMI remote control) ── */
    if (topic === TOPIC_SCALE1_DEVICE_STATE) {
      try {
        setDeviceState(JSON.parse(str));
      } catch (e) {
        console.error('[MQTT] Failed to parse device_state:', e);
      }
      return;
    }

    /* ── HMI switch state (forge.md §4) ──
       Topic pattern: pineapple/hmi/{switchId}/state → "on" | "off" */
    if (topic.startsWith('pineapple/hmi/') && topic.endsWith('/state')) {
      const switchId = topic.replace('pineapple/hmi/', '').replace('/state', '');
      setSwitchStates((prev) => ({
        ...prev,
        [switchId]: str === 'on' ? 'on' : 'off',
      }));
      return;
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

      /* Scale telemetry (existing) */
      client.subscribe(TOPIC_SCALE1_WILDCARD, { qos: 1 }, (err) => {
        if (err) console.error('[MQTT] Subscribe scale error:', err);
      });

      /* Vision zones (forge.md §3) */
      client.subscribe(TOPIC_VISION_ZONE1, { qos: 1 }, (err) => {
        if (err) console.error('[MQTT] Subscribe zone1 error:', err);
      });
      client.subscribe(TOPIC_VISION_ZONE2, { qos: 1 }, (err) => {
        if (err) console.error('[MQTT] Subscribe zone2 error:', err);
      });

      /* HMI switch states (forge.md §4) — wildcard for all switches */
      client.subscribe(TOPIC_HMI_STATE_WILDCARD, { qos: 1 }, (err) => {
        if (err) console.error('[MQTT] Subscribe hmi error:', err);
      });

      /* Device state (Part 3: HMI remote control) */
      client.subscribe(TOPIC_SCALE1_DEVICE_STATE, { qos: 1 }, (err) => {
        if (err) console.error('[MQTT] Subscribe device_state error:', err);
      });
    });

    client.on('close', handleClose);
    client.on('error', handleError);
    client.on('message', handleMessage);

    return () => {
      client.end(true);
    };
  }, [brokerUrl, handleConnect, handleClose, handleError, handleMessage]);

  /* ── Switch command publisher (forge.md §4) ── */

  /**
   * Publish a switch command to the hardware.
   * @param {string} switchId — e.g. "switch_1"
   * @param {'on' | 'off'} command
   */
  const publishSwitchCommand = useCallback((switchId, command) => {
    if (clientRef.current?.connected) {
      const topic = hmiSetTopic(switchId);
      clientRef.current.publish(topic, command, { qos: 1 });
    } else {
      console.warn('[MQTT] Cannot publish switch command — not connected');
    }
  }, []);

  /* ── Device command publisher (Part 3: HMI remote control) ── */

  /**
   * Publish a command to the scale hardware.
   * @param {'power' | 'tare' | 'mode' | 'log_trigger'} action
   */
  const publishDeviceCommand = useCallback((action) => {
    if (clientRef.current?.connected) {
      const topic = deviceCommandTopic('scale1');
      const payload = JSON.stringify({ action });
      clientRef.current.publish(topic, payload, { qos: 1 });
    } else {
      console.warn('[MQTT] Cannot publish command — not connected');
    }
  }, []);

  return {
    /** @type {MqttConnectionState} */
    connectionState,
    /** @type {'online' | 'offline' | null} */
    availability,
    /** Raw weight in grams from firmware, or null. NOW REPRESENTS CRATE TOTAL. */
    weightG,
    /** Raw grade string from firmware, or null. */
    grade,
    /** Sensor/network fault booleans, or null if never received. */
    status,
    /** Free-running millis() counter from firmware — livelock detection only. */
    ts,
    /** True when connected, online, no sensor/network faults, AND Zone 1 clear. */
    dataValid,

    /* ── Zone state (forge.md §3) ── */
    /** @type {'occupied' | 'clear' | null} */
    zone1,
    /** @type {'occupied' | 'clear' | null} */
    zone2,
    /** True when Zone 2 is occupied — capture sequence armed. */
    captureArmed,

    /* ── Switch state + command (forge.md §4) ── */
    /** @type {Record<string, 'on' | 'off'>} */
    switchStates,
    /** Publish a switch command to the hardware. */
    publishSwitchCommand,

    /* ── Device state + command (Part 3: HMI remote control) ── */
    /** @type {{ power?: 'on'|'off', mode?: string, tare?: boolean } | null} */
    deviceState,
    /** Publish a command to the scale hardware. */
    publishDeviceCommand,
  };
}
