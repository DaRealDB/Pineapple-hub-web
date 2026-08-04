import { useState, useCallback } from 'react';

/**
 * Hook: manages OCR pipeline state and configuration
 * Provides functions to start/stop pipeline and update configuration
 */
export default function usePipeline() {
  const [pipelineState, setPipelineState] = useState({
    isRunning: false,
    sessionId: null,
    config: {
      ocrInterval: 1.0,
      confidenceThreshold: 0.5,
      dedupSimilarityThreshold: 0.85,
      dedupMaxHistory: 10,
      dedupStrategy: 'fuzzy',
    },
  });

  const [pipelineMetrics, setPipelineMetrics] = useState({
    fps: 0,
    processingTimeMs: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    totalProcessed: 0,
    duplicateCount: 0,
  });

  /**
   * Start the OCR pipeline
   */
  const startPipeline = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_OCR_API_URL || 'http://localhost:8000'}/api/pipeline/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pipelineState.config),
      });

      if (!response.ok) throw new Error('Failed to start pipeline');

      const data = await response.json();
      setPipelineState((prev) => ({
        ...prev,
        isRunning: true,
        sessionId: data.session_id,
      }));
    } catch (error) {
      console.error('[Pipeline] Start error:', error);
      throw error;
    }
  }, [pipelineState.config]);

  /**
   * Stop the OCR pipeline
   */
  const stopPipeline = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_OCR_API_URL || 'http://localhost:8000'}/api/pipeline/stop`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to stop pipeline');

      setPipelineState((prev) => ({
        ...prev,
        isRunning: false,
        sessionId: null,
      }));
    } catch (error) {
      console.error('[Pipeline] Stop error:', error);
      throw error;
    }
  }, []);

  /**
   * Update pipeline configuration
   */
  const updateConfig = useCallback((key, value) => {
    setPipelineState((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        [key]: value,
      },
    }));
  }, []);

  /**
   * Apply configuration changes to running pipeline
   */
  const applyConfig = useCallback(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_OCR_API_URL || 'http://localhost:8000'}/api/pipeline/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pipelineState.config),
      });

      if (!response.ok) throw new Error('Failed to apply config');
    } catch (error) {
      console.error('[Pipeline] Config error:', error);
      throw error;
    }
  }, [pipelineState.config]);

  /**
   * Update pipeline metrics
   */
  const updateMetrics = useCallback((metrics) => {
    setPipelineMetrics((prev) => ({
      ...prev,
      ...metrics,
    }));
  }, []);

  return {
    pipelineState,
    pipelineMetrics,
    startPipeline,
    stopPipeline,
    updateConfig,
    applyConfig,
    updateMetrics,
  };
}
