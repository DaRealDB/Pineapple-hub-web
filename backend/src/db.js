import pg from 'pg';
import config from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

// Second pool for the OCR pipeline database (analytics queries)
const ocrDbUrl = config.ocrDatabaseUrl || config.databaseUrl.replace(/\/[^/]+$/, '/ocr_pipeline');
export const ocrPool = new Pool({
  connectionString: ocrDbUrl,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err);
});

ocrPool.on('error', (err) => {
  console.error('[DB] OCR pool error:', err);
});

/**
 * Run a parameterized query and return rows.
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

/**
 * Run a query against the OCR pipeline database.
 */
export async function ocrQuery(sql, params = []) {
  const client = await ocrPool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

/**
 * Test database connectivity.
 * @returns {Promise<boolean>}
 */
export async function testConnection() {
  try {
    await query('SELECT 1');
    return true;
  } catch (err) {
    console.error('[DB] Connection test failed:', err.message);
    return false;
  }
}
