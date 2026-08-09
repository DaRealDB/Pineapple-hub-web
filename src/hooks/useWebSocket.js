import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * WebSocket connection states.
 * @typedef {'connecting' | 'connected' | 'offline' | 'error'} WebSocketConnectionState
 */

/**
 * Hook: connects to the OCR pipeline WebSocket server, receives real-time
 * OCR results, pipeline metrics, and webcam frames.
 *
 * Per MASTER_ARCHITECTURE.md WebSocket contract:
 *   - ocr_result: New OCR text recognition results
 *   - pipeline_status: Pipeline health and performance metrics
 *   - webcam_frame: Processed webcam frames
 *   - deduplication_alert: Duplicate detection alerts
 */
export default function useWebSocket() {
  console.log('[useWebSocket] Hook called');
  const wsUrl = import.meta.env.VITE_OCR_WS_URL;
  console.log('[useWebSocket] VITE_OCR_WS_URL:', wsUrl);

  // Validate WebSocket URL (must happen BEFORE any hook calls to avoid
  // rules-of-hooks violations — derived booleans computed from a build-time
  // constant so they never change between renders).
  const wsConfigured = !!wsUrl;
  const wsValid =
    wsConfigured &&
    (wsUrl.startsWith('ws://') || wsUrl.startsWith('wss://'));

  // Ensure WebSocket URL ends with /ws
  const wsEndpoint = wsConfigured
    ? (wsUrl.endsWith('/ws') ? wsUrl : `${wsUrl}/ws`)
    : null;

  // ═══ All hooks must be called unconditionally (Rules of Hooks) ═══

  const clientRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const mountedRef = useRef(true);  // prevents reconnection after unmount
  const MAX_RECONNECT_ATTEMPTS = 5;

  const [connectionState, setConnectionState] = useState(
    /** @type {WebSocketConnectionState} */ ('connecting')
  );
  const [ocrResults, setOcrResults] = useState([]);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [webcamFrame, setWebcamFrame] = useState(null);
  const [deduplicationAlerts, setDeduplicationAlerts] = useState([]);
  const [yoloDetections, setYoloDetections] = useState(null);
  const [crateState, setCrateState] = useState(null);

  const handleConnect = useCallback(() => {
    console.log('[useWebSocket] Connected');
    setConnectionState('connected');
    reconnectAttempts.current = 0;
  }, []);

  const handleError = useCallback((err) => {
    console.error('[useWebSocket] Error:', err);
    setConnectionState('error');
  }, []);

  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('[useWebSocket] Received message:', data.type);

      // Validate message structure
      if (!data || typeof data !== 'object') {
        console.warn('[useWebSocket] Invalid message structure');
        return;
      }

      switch (data.type) {
        case 'ocr_result':
          if (data.payload && typeof data.payload === 'object') {
            setOcrResults((prev) => [data.payload, ...prev].slice(0, 100)); // Keep last 100
            console.log('[useWebSocket] OCR result added');
          }
          break;
        case 'pipeline_status':
          if (data.payload && typeof data.payload === 'object') {
            setPipelineStatus(data.payload);
            console.log('[useWebSocket] Pipeline status updated');
          }
          break;
        case 'webcam_frame':
          if (data.payload && typeof data.payload === 'object') {
            setWebcamFrame(data.payload);
            console.log('[useWebSocket] Webcam frame updated');
          }
          break;
        case 'deduplication_alert':
          if (data.payload && typeof data.payload === 'object') {
            setDeduplicationAlerts((prev) => [data.payload, ...prev].slice(0, 50));
            console.log('[useWebSocket] Deduplication alert added');
          }
          break;
        case 'yolo_detections':
          if (data.payload && typeof data.payload === 'object') {
            setYoloDetections(data.payload);
            console.log('[useWebSocket] YOLO detections updated');
          }
          break;
        case 'crate_state':
          if (data.payload && typeof data.payload === 'object') {
            setCrateState(data.payload);
            console.log('[useWebSocket] Crate state updated:', data.payload.state);
          }
          break;
        case 'connection_established':
          // Handshake confirmation — no action needed
          break;
        default:
          console.warn('[useWebSocket] Unknown message type:', data.type);
      }
    } catch (e) {
      console.error('[useWebSocket] Failed to parse message:', e);
    }
  }, []);

  const handleClose = useCallback(() => {
    console.log('[useWebSocket] Disconnected');
    setConnectionState('offline');

    // Stop reconnecting if component unmounted
    if (!mountedRef.current) {
      console.log('[useWebSocket] Component unmounted — skipping reconnection');
      return;
    }

    // Attempt reconnection with exponential backoff
    if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current++;
      
      console.log(`[useWebSocket] Reconnection attempt ${reconnectAttempts.current} in ${delay}ms`);
      
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[useWebSocket] Attempting reconnection...');
        const client = new WebSocket(wsEndpoint);
        clientRef.current = client;
        client.onopen = handleConnect;
        client.onclose = handleClose;
        client.onerror = handleError;
        client.onmessage = handleMessage;
      }, delay);
    }
  }, [wsEndpoint, handleConnect]);

  useEffect(() => {
    if (!wsValid || !wsEndpoint) {
      console.warn('[useWebSocket] Skipping connection — URL not configured or invalid');
      return;
    }

    console.log('[useWebSocket] Setting up WebSocket connection to:', wsEndpoint);
    const client = new WebSocket(wsEndpoint);

    clientRef.current = client;

    // ── Connection timeout: 10s ──────────────────────────────────
    // Native WebSocket has no built-in timeout — a refused connection
    // can hang in CONNECTING state indefinitely on some platforms.
    const connectTimeout = setTimeout(() => {
      if (client.readyState === WebSocket.CONNECTING) {
        console.warn('[useWebSocket] Connection timed out after 10s');
        setConnectionState('error');
        client.close();
      }
    }, 10000);

    client.onopen = () => {
      clearTimeout(connectTimeout);
      handleConnect();
    };
    client.onclose = (event) => {
      clearTimeout(connectTimeout);
      console.log('[useWebSocket] Close event — code:', event?.code);
      handleClose();
    };
    client.onerror = (err) => {
      clearTimeout(connectTimeout);
      console.error('[useWebSocket] Error event:', err?.type || err);
      handleError(err);
    };
    client.onmessage = handleMessage;

    return () => {
      clearTimeout(connectTimeout);
      console.log('[useWebSocket] Cleaning up WebSocket');
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    };
  }, [wsEndpoint, wsValid, handleConnect, handleClose, handleError, handleMessage]);

  /**
   * Send a message to the WebSocket server
   * @param {object} payload - Data to send
   */
  const sendMessage = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') {
      console.error('[useWebSocket] Invalid payload');
      return;
    }
    
    if (clientRef.current?.readyState === WebSocket.OPEN) {
      try {
        clientRef.current.send(JSON.stringify(payload));
        console.log('[useWebSocket] Message sent');
      } catch (e) {
        console.error('[useWebSocket] Failed to send message:', e);
      }
    } else {
      console.warn('[useWebSocket] Cannot send message, connection not open');
    }
  }, []);

  // Derive connection error from validation state
  const connectionError = !wsConfigured
    ? 'WebSocket URL not configured — check VITE_OCR_WS_URL in .env'
    : !wsValid
      ? `Invalid WebSocket URL: ${wsUrl} — must start with ws:// or wss://`
      : null;

  // Derive effective connection state (overridden when URL is invalid)
  const effectiveConnState = !wsValid ? 'error' : connectionState;

  console.log('[useWebSocket] Returning state:', { connectionState: effectiveConnState, ocrResultsCount: ocrResults.length });
  return {
    /** @type {WebSocketConnectionState} */
    connectionState: effectiveConnState,
    /** Human-readable error when connection fails (null when OK) */
    connectionError,
    /** Array of recent OCR results */
    ocrResults,
    /** Current pipeline status and metrics */
    pipelineStatus,
    /** Latest webcam frame data */
    webcamFrame,
    /** Array of deduplication alerts */
    deduplicationAlerts,
    /** Latest YOLO detection results */
    yoloDetections,
    /** Crate logging state machine status */
    crateState,
    /** Send message to WebSocket server */
    sendMessage,
  };
}
