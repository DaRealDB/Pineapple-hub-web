/**
 * Node-RED API client.
 * The existing Node-RED flows expose HTTP endpoints for CSV export and
 * (potentially) historical data queries. This module isolates those calls
 * so the endpoint URLs can be changed in one place.
 */

const BASE_URL =
  import.meta.env.VITE_NODE_RED_BASE_URL || 'http://localhost:1880';

/**
 * Download a CSV export from Node-RED.
 * Triggers a browser download of the file.
 * @param {'weights' | 'connections'} type
 */
export async function downloadCsv(type) {
  const endpoint = type === 'weights' ? '/export/weights' : '/export/connections';
  const url = `${BASE_URL}${endpoint}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status} ${res.statusText}`);
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = type === 'weights' ? 'weights.csv' : 'connections.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Fetch weight log history from Node-RED SQLite.
 * NOTE: BUILD_SPEC.md mentions SQLite logging lives in Node-RED; the exact
 * query endpoint path is not fully specified. This is a placeholder wired
 * to a plausible endpoint — update the URL once the Node-RED flow exposes
 * a dedicated HTTP endpoint for history queries.
 * @param {{ limit?: number, offset?: number }} params
 * @returns {Promise<Array>}
 */
export async function fetchWeightLog({ limit = 50, offset = 0 } = {}) {
  const url = `${BASE_URL}/api/weights?limit=${limit}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`History fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch connection event log from Node-RED SQLite.
 * Same caveat as fetchWeightLog — endpoint path is a placeholder.
 * @param {{ limit?: number, offset?: number }} params
 * @returns {Promise<Array>}
 */
export async function fetchConnectionLog({ limit = 50, offset = 0 } = {}) {
  const url = `${BASE_URL}/api/connections?limit=${limit}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Connection log fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
