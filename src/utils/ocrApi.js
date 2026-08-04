/**
 * OCR Pipeline API client.
 * Handles communication with the OCR pipeline backend for configuration,
 * control, and data retrieval.
 */

const BASE_URL = import.meta.env.VITE_OCR_API_URL;

// Validate base URL
if (!BASE_URL) {
  console.error('[OCR API] VITE_OCR_API_URL not configured');
}

if (BASE_URL && !BASE_URL.startsWith('http://') && !BASE_URL.startsWith('https://')) {
  console.error('[OCR API] Invalid API URL format');
}

/**
 * Helper function for API calls with error handling
 * @param {string} endpoint - API endpoint
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<object>}
 */
async function apiCall(endpoint, options = {}) {
  if (!BASE_URL) {
    throw new Error('OCR API URL not configured');
  }

  const url = `${BASE_URL}${endpoint}`;
  
  try {
    const res = await fetch(url, options);
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API call failed: ${res.status} ${res.statusText} - ${errorText}`);
    }
    
    return await res.json();
  } catch (error) {
    console.error('[OCR API] Request failed:', error);
    throw error;
  }
}

/**
 * Start the OCR pipeline
 * @param {object} config - Pipeline configuration
 * @returns {Promise<object>}
 */
export async function startPipeline(config = {}) {
  // Validate config
  if (config.ocr_interval !== undefined && (config.ocr_interval <= 0 || config.ocr_interval > 60)) {
    throw new Error('OCR interval must be between 0 and 60 seconds');
  }
  
  if (config.confidence_threshold !== undefined && (config.confidence_threshold < 0 || config.confidence_threshold > 1)) {
    throw new Error('Confidence threshold must be between 0 and 1');
  }

  return apiCall('/api/pipeline/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

/**
 * Stop the OCR pipeline
 * @returns {Promise<object>}
 */
export async function stopPipeline() {
  return apiCall('/api/pipeline/stop', {
    method: 'POST',
  });
}

/**
 * Update pipeline configuration
 * @param {object} config - New configuration
 * @returns {Promise<object>}
 */
export async function updatePipelineConfig(config) {
  // Validate config
  if (config.ocr_interval !== undefined && (config.ocr_interval <= 0 || config.ocr_interval > 60)) {
    throw new Error('OCR interval must be between 0 and 60 seconds');
  }
  
  if (config.confidence_threshold !== undefined && (config.confidence_threshold < 0 || config.confidence_threshold > 1)) {
    throw new Error('Confidence threshold must be between 0 and 1');
  }

  return apiCall('/api/pipeline/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

/**
 * Fetch historical OCR results
 * @param {{ limit?: number, offset?: number, sessionId?: string }} params
 * @returns {Promise<Array>}
 */
export async function fetchOCRResults({ limit = 50, offset = 0, sessionId = null } = {}) {
  // Validate parameters
  const validatedLimit = Math.min(Math.max(limit, 1), 1000);
  const validatedOffset = Math.max(offset, 0);

  const params = new URLSearchParams({
    limit: validatedLimit.toString(),
    offset: validatedOffset.toString(),
  });
  
  if (sessionId) {
    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      throw new Error('Invalid session ID format');
    }
    params.append('session_id', sessionId);
  }

  return apiCall(`/api/ocr/results?${params}`);
}

/**
 * Export OCR data
 * @param {'csv' | 'json'} format
 * @param {{ startDate?: string, endDate?: string, sessionId?: string }} filters
 * @returns {Promise<void>}
 */
export async function exportOCRData(format = 'csv', filters = {}) {
  // Validate format
  if (!['csv', 'json'].includes(format)) {
    throw new Error('Format must be csv or json');
  }

  const params = new URLSearchParams({ format });
  
  if (filters.startDate) {
    // Validate date format
    const date = new Date(filters.startDate);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid start date format');
    }
    params.append('start_date', filters.startDate);
  }
  
  if (filters.endDate) {
    const date = new Date(filters.endDate);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid end date format');
    }
    params.append('end_date', filters.endDate);
  }
  
  if (filters.sessionId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(filters.sessionId)) {
      throw new Error('Invalid session ID format');
    }
    params.append('session_id', filters.sessionId);
  }

  const url = `${BASE_URL}/api/ocr/export?${params}`;
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status} ${res.statusText}`);
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `ocr_export_${Date.now()}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Fetch pipeline performance metrics
 * @param {{ sessionId?: string, metricType?: string, limit?: number }} params
 * @returns {Promise<Array>}
 */
export async function fetchPipelineMetrics({ sessionId = null, metricType = null, limit = 100 } = {}) {
  const validatedLimit = Math.min(Math.max(limit, 1), 1000);

  const params = new URLSearchParams({ limit: validatedLimit.toString() });
  
  if (sessionId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      throw new Error('Invalid session ID format');
    }
    params.append('session_id', sessionId);
  }
  
  if (metricType) {
    // Basic validation for metric type
    if (typeof metricType !== 'string' || metricType.length > 50) {
      throw new Error('Invalid metric type');
    }
    params.append('metric_type', metricType);
  }

  return apiCall(`/api/pipeline/metrics?${params}`);
}

/**
 * Fetch pipeline sessions
 * @param {{ limit?: number, offset?: number, status?: string }} params
 * @returns {Promise<Array>}
 */
export async function fetchSessions({ limit = 20, offset = 0, status = null } = {}) {
  const validatedLimit = Math.min(Math.max(limit, 1), 1000);
  const validatedOffset = Math.max(offset, 0);

  const params = new URLSearchParams({
    limit: validatedLimit.toString(),
    offset: validatedOffset.toString(),
  });
  
  if (status) {
    const validStatuses = ['active', 'completed', 'error', 'terminated'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }
    params.append('status', status);
  }

  return apiCall(`/api/sessions?${params}`);
}

/**
 * Verify OCR result
 * @param {number} resultId - OCR result ID
 * @param {'verified' | 'rejected'} status - Verification status
 * @param {string} verifiedBy - User who verified
 * @returns {Promise<object>}
 */
export async function verifyOCRResult(resultId, status, verifiedBy) {
  // Validate parameters
  if (!Number.isInteger(resultId) || resultId <= 0) {
    throw new Error('Invalid result ID');
  }
  
  const validStatuses = ['verified', 'rejected'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }
  
  if (!verifiedBy || typeof verifiedBy !== 'string' || verifiedBy.trim().length === 0) {
    throw new Error('Verified by cannot be empty');
  }
  
  if (verifiedBy.length > 100) {
    throw new Error('Verified by too long');
  }

  return apiCall('/api/ocr/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      result_id: resultId,
      status,
      verified_by: verifiedBy.trim(),
    }),
  });
}
