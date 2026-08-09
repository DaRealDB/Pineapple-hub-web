import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook: connects to the OCR pipeline SSE (Server-Sent Events) stream.
 *
 * Replaces WebSocket with the browser-native EventSource API:
 *   - Auto-reconnect on disconnect (built into EventSource)
 *   - No framing protocol, no handshake — just HTTP
 *   - Works through proxies and firewalls
 *
 * SSE endpoint: GET /api/pipeline/stream
 * Event types: webcam_frame, ocr_result, pipeline_status, yolo_detections
 */
export default function useSSE() {
  const apiUrl = import.meta.env.VITE_OCR_API_URL || 'http://localhost:8000';
  const sseUrl = `${apiUrl}/api/pipeline/stream`;

  const esRef = useRef(null);
  const mountedRef = useRef(true);

  const [connectionState, setConnectionState] = useState(
    /** @type {'connecting' | 'connected' | 'offline' | 'error'} */ ('connecting')
  );
  const [connectionError, setConnectionError] = useState(null);
  const [ocrResults, setOcrResults] = useState([]);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [webcamFrame, setWebcamFrame] = useState(null);
  const [yoloDetections, setYoloDetections] = useState(null);
  const [crateState, setCrateState] = useState(null);

  // ── parse and dispatch SSE events ──────────────────────────────
  const handleEvent = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);
      if (!data || typeof data !== 'object') return;

      switch (data.type) {
        case 'webcam_frame':
          if (data.payload?.frame_data) {
            setWebcamFrame(data.payload);
          }
          break;
        case 'ocr_result':
          if (data.payload && typeof data.payload === 'object') {
            setOcrResults((prev) => [data.payload, ...prev].slice(0, 100));
          }
          break;
        case 'pipeline_status':
          if (data.payload && typeof data.payload === 'object') {
            setPipelineStatus(data.payload);
          }
          break;
        case 'yolo_detections':
          if (data.payload && typeof data.payload === 'object') {
            setYoloDetections(data.payload);
          }
          break;
        case 'crate_state':
          if (data.payload && typeof data.payload === 'object') {
            setCrateState(data.payload);
          }
          break;
      }
    } catch (e) {
      console.error('[SSE] Failed to parse event:', e);
    }
  }, []);

  // ── EventSource lifecycle ──────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    console.log('[SSE] Connecting to:', sseUrl);
    const es = new EventSource(sseUrl);
    esRef.current = es;

    es.addEventListener('connected', () => {
      console.log('[SSE] Connected');
      setConnectionState('connected');
      setConnectionError(null);
    });

    es.addEventListener('webcam_frame', handleEvent);
    es.addEventListener('ocr_result', handleEvent);
    es.addEventListener('pipeline_status', handleEvent);
    es.addEventListener('yolo_detections', handleEvent);
    es.addEventListener('crate_state', handleEvent);

    // Generic handler for unnamed events
    es.onmessage = handleEvent;

    es.onerror = () => {
      // EventSource doesn't give us error details — just readyState
      if (!mountedRef.current) return;
      if (es.readyState === EventSource.CLOSED) {
        console.warn('[SSE] Connection closed');
        setConnectionState('offline');
      } else {
        // CONNECTING — EventSource is auto-reconnecting
        console.log('[SSE] Reconnecting...');
        setConnectionState('connecting');
      }
      setConnectionError(
        'SSE connection lost — auto-reconnecting. Check OCR backend on :8000.'
      );
    };

    return () => {
      mountedRef.current = false;
      console.log('[SSE] Closing connection');
      es.close();
      esRef.current = null;
    };
  }, [sseUrl, handleEvent]);

  return {
    connectionState,
    connectionError,
    ocrResults,
    pipelineStatus,
    webcamFrame,
    yoloDetections,
    crateState,
  };
}
