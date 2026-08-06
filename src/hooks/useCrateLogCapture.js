import { useEffect, useRef } from 'react';
import useApi from './useApi';

/**
 * CAPTURE WINDOW (ms): how long after the last OCR result we consider weight
 * and zone data to be part of the "same" crate placement event.
 * Documented in forge.md — adjust based on real pipeline latency.
 */
const CAPTURE_WINDOW_MS = 3000;

/**
 * Hook: watches MQTT weight/zones + OCR results, and creates crate_log rows
 * when all three conditions align within the capture window.
 *
 * Conditions:
 *   1. Valid weight (Zone 1 clear, no sensor faults)
 *   2. Zone 2 occupied (capture armed)
 *   3. OCR result with text extracted
 *
 * If OCR fails (no text or low confidence), still logs with ocr_extracted_id = null.
 *
 * @param {object} mqtt — MQTT context from useMqtt()
 * @param {object} latestOcr — most recent OCR result from WebSocket/pipeline
 */
export default function useCrateLogCapture(mqtt, latestOcr) {
  const { post } = useApi();
  const lastCaptureRef = useRef(0);
  const pendingRef = useRef(null);

  useEffect(() => {
    if (!mqtt || !latestOcr) return;

    const { weightG, dataValid, captureArmed, zone1, zone2, grade } = mqtt;

    // Must have: valid weight, capture armed, OCR text (or failed attempt)
    if (!dataValid || !captureArmed || weightG == null) return;

    // Avoid duplicate captures within the window
    const now = Date.now();
    if (now - lastCaptureRef.current < CAPTURE_WINDOW_MS) return;

    // Debounce — wait for stable conditions
    if (pendingRef.current) {
      clearTimeout(pendingRef.current);
    }

    pendingRef.current = setTimeout(() => {
      lastCaptureRef.current = Date.now();

      const logEntry = {
        device_id: 'scale1',
        batch_id: latestOcr.text || null,
        crate_weight_g: weightG,
        grade: grade || 'PENDING_FORMULA',
        zone1_status: zone1 || 'unknown',
        zone2_status: zone2 || 'unknown',
        ocr_extracted_id: latestOcr.text || null,
        ocr_confidence: latestOcr.confidence != null
          ? parseFloat((latestOcr.confidence * 100).toFixed(2))
          : null,
        capture_trigger: 'auto_zone',
        captured_at: new Date().toISOString(),
      };

      post('/api/crate-logs', logEntry)
        .then((data) => {
          console.log('[CrateLogCapture] Logged:', data.log.id);
        })
        .catch((err) => {
          console.error('[CrateLogCapture] Failed to create log:', err);
        });

      pendingRef.current = null;
    }, 500); // 500ms debounce for stable reading

    return () => {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
    };
  }, [mqtt?.weightG, mqtt?.dataValid, mqtt?.captureArmed, latestOcr]);
}
