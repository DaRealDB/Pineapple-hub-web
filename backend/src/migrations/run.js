import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id          SERIAL PRIMARY KEY,
      name        TEXT UNIQUE NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations() {
  const { rows } = await query('SELECT name FROM migrations ORDER BY id');
  return new Set(rows.map((r) => r.name));
}

async function run() {
  console.log('[Migrate] Connecting to database...');
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  const files = readdirSync(__dirname)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[Migrate] SKIP ${file} — already applied`);
      continue;
    }

    const sql = readFileSync(resolve(__dirname, file), 'utf-8');
    console.log(`[Migrate] RUN  ${file}...`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[Migrate] DONE ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Migrate] FAIL ${file}:`, err.message);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log('[Migrate] All migrations applied.');
  await pool.end();
}

run();
