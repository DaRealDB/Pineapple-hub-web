# Pineapple Hub Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PostgreSQL persistence, RBAC auth, remote HMI over MQTT, OCR+CNN crate logging pipeline, and targeted UI removals/refinements to Pineapple Hub.

**Architecture:** Add a lightweight Express backend (`backend/`) that handles auth, device CRUD, crate-log API, and HMI command proxying. The backend connects to PostgreSQL (two schemas: `grading` + `auth` in one instance) and to the MQTT broker for publishing commands. The React frontend gains an AuthContext, login page, RBAC-gated UI, real HMI panel, and removal of dead UI elements. Firmware changes are documented but blocked on missing `.ino` file.

**Tech Stack:** Express.js, `pg` driver, `bcryptjs`, `jsonwebtoken`, `mqtt` (server-side), React 19, Vite 6, Tailwind 3, React Router 7, Recharts 2

## Global Constraints

- No second PostgreSQL server — two schemas (`grading` + `auth`) in one instance unless team overrides
- RBAC enforced server-side; hiding UI is not access control
- No duplicated firmware logic between physical-button and MQTT-command paths
- No duplicated Analytics implementations between roles — one component tree, permission-gated
- All MQTT topic strings from `src/constants/mqttTopics.js`
- All grading/formatting logic in `src/utils/formatters.js`
- Design tokens from `tailwind.config.js` only — no new visual patterns
- `npm run dev` / `npm run build` must succeed with no new errors
- Update `forge.md` Decisions log with all resolved assumptions
- Reset-button reinterpretation stays flagged as unconfirmed assumption
- Missing `pineapple_scale_firmware.ino` — firmware tasks are documentation-only until file is provided

---

## File Structure Map

```
pineapple-hub-web/
├── backend/                          # NEW — Express API server
│   ├── package.json
│   ├── .env.example
│   ├── src/
│   │   ├── index.js                  # Server entry, Express app setup
│   │   ├── config.js                 # Env vars, constants
│   │   ├── db.js                     # PostgreSQL pool + query helpers
│   │   ├── mqtt.js                   # MQTT client (command publishing)
│   │   ├── migrations/
│   │   │   ├── 001_schemas.sql       # CREATE SCHEMA + TABLES
│   │   │   ├── 002_seed_roles.sql    # INSERT roles, permissions, role_permissions
│   │   │   └── run.js                # Migration runner
│   │   ├── middleware/
│   │   │   ├── auth.js               # JWT session validation
│   │   │   └── rbac.js               # Permission-check middleware factory
│   │   └── routes/
│   │       ├── auth.js               # POST /login, POST /logout, GET /me
│   │       ├── devices.js            # GET/POST/PUT/DELETE /api/devices
│   │       ├── crateLogs.js          # GET/POST /api/crate-logs
│   │       └── hmi.js                # POST /api/hmi/command
│
├── src/                              # EXISTING — frontend modifications
│   ├── context/
│   │   └── AuthContext.jsx           # NEW — auth state + API client provider
│   ├── components/
│   │   ├── LoginPage.jsx             # NEW — login form
│   │   ├── ProtectedRoute.jsx        # NEW — auth + permission route guard
│   │   └── HMIPanel.jsx              # NEW — real HMI controls (power/tare/mode/log)
│   ├── hooks/
│   │   ├── useMqtt.js                # MODIFY — add command publish, device_state sub
│   │   └── useApi.js                 # NEW — fetch wrapper with auth token
│   ├── screens/
│   │   ├── LiveGrading.jsx           # MODIFY — remove Environment card
│   │   ├── Analytics.jsx             # MODIFY — remove pills, permission-gate, remove bottom bar
│   │   ├── DeviceManagement.jsx      # MODIFY — add HMIPanel, wire breadcrumb data
│   │   ├── OperationsLog.jsx         # MODIFY — wire to real API
│   │   └── OCRPipeline.jsx           # MODIFY — wire OCR results to crate-log creation
│   ├── constants/
│   │   ├── mqttTopics.js             # MODIFY — add TOPIC_SCALE1_COMMAND, TOPIC_SCALE1_DEVICE_STATE
│   │   └── permissions.js            # NEW — permission key constants
│   ├── components/
│   │   ├── TopBar.jsx                # MODIFY — wire breadcrumb to real device location
│   │   └── Sidebar.jsx               # MODIFY — add logout, user info from auth context
│   ├── App.jsx                       # MODIFY — wrap with AuthProvider, add login route
│   └── main.jsx                      # (no changes needed)
│
├── docs/superpowers/specs/           # Design docs
└── forge.md                          # MODIFY — append decisions
```

---

## Phase 1: Database Schema + Backend Skeleton

### Task 1: Create backend package.json and install dependencies

**Files:**
- Create: `backend/package.json`
- Create: `backend/.env.example`

**Interfaces:**
- Produces: `backend/` directory with installable package

- [x] **Step 1: Write backend/package.json**

```json
{
  "name": "pineapple-hub-backend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "migrate": "node src/migrations/run.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "jsonwebtoken": "^9.0.2",
    "mqtt": "^5.10.1",
    "pg": "^8.13.1"
  }
}
```

- [x] **Step 2: Write backend/.env.example**

```
# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pineapple_hub

# JWT
JWT_SECRET=change-me-to-a-random-string-at-least-32-chars
JWT_EXPIRES_IN=24h

# MQTT Broker (Aedes inside Node-RED)
MQTT_BROKER_URL=mqtt://192.168.1.10:1883

# Server
PORT=3001
```

- [x] **Step 3: Install dependencies**

```bash
cd backend && npm install
```

- [x] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.env.example
git commit -m "feat: scaffold backend Express server with dependencies

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Create database migration files

**Files:**
- Create: `backend/src/migrations/001_schemas.sql`
- Create: `backend/src/migrations/002_seed_roles.sql`

**Interfaces:**
- Produces: SQL files that create `grading` and `auth` schemas with all tables, indexes, and seed data

- [x] **Step 1: Write 001_schemas.sql**

```sql
-- 001_schemas.sql — Create grading and auth schemas with all tables

BEGIN;

CREATE SCHEMA IF NOT EXISTS grading;
CREATE SCHEMA IF NOT EXISTS auth;

-- ── grading schema ──

CREATE TABLE grading.devices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id           TEXT UNIQUE NOT NULL,
  label               TEXT NOT NULL,
  location_path       TEXT NOT NULL,
  mqtt_topic_prefix   TEXT NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE grading.crate_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id           UUID NOT NULL REFERENCES grading.devices(id),
  batch_id            TEXT,
  crate_weight_g      INTEGER NOT NULL,
  grade               TEXT NOT NULL CHECK (grade IN ('light','grade_1','heavy','invalid','PENDING_FORMULA')),
  zone1_status_at_capture TEXT NOT NULL CHECK (zone1_status_at_capture IN ('clear','occupied','unknown')),
  zone2_status_at_capture TEXT NOT NULL CHECK (zone2_status_at_capture IN ('clear','occupied','unknown')),
  ocr_extracted_id    TEXT,
  ocr_confidence      NUMERIC(5,2),
  capture_trigger     TEXT NOT NULL CHECK (capture_trigger IN ('auto_zone', 'manual_button')),
  audit_status        TEXT NOT NULL DEFAULT 'pending' CHECK (audit_status IN ('pending','confirmed','flagged')),
  captured_at         TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_crate_logs_device_time ON grading.crate_logs (device_id, captured_at DESC);
CREATE INDEX idx_crate_logs_batch ON grading.crate_logs (batch_id);

CREATE TABLE grading.hmi_command_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id           UUID NOT NULL REFERENCES grading.devices(id),
  user_id             UUID NOT NULL,
  action              TEXT NOT NULL CHECK (action IN ('power','tare','mode','log_trigger')),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at     TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','timed_out'))
);

-- ── auth schema ──

CREATE TABLE auth.roles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT UNIQUE NOT NULL,
  hierarchy_level     INTEGER NOT NULL
);

CREATE TABLE auth.permissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                 TEXT UNIQUE NOT NULL
);

CREATE TABLE auth.role_permissions (
  role_id             UUID NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
  permission_id       UUID NOT NULL REFERENCES auth.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE auth.users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT UNIQUE NOT NULL,
  password_hash       TEXT NOT NULL,
  full_name           TEXT NOT NULL,
  role_id             UUID NOT NULL REFERENCES auth.roles(id),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at       TIMESTAMPTZ
);

CREATE TABLE auth.sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ
);

COMMIT;
```

- [x] **Step 2: Write 002_seed_roles.sql**

```sql
-- 002_seed_roles.sql — Seed roles, permissions, role_permissions, and default admin user
-- Default admin password: "admin123" (bcrypt hash — CHANGE IN PRODUCTION)

BEGIN;

-- Roles
INSERT INTO auth.roles (id, name, hierarchy_level) VALUES
  (gen_random_uuid(), 'admin',      0),
  (gen_random_uuid(), 'supervisor', 1),
  (gen_random_uuid(), 'employee',   2)
ON CONFLICT (name) DO NOTHING;

-- Permissions
INSERT INTO auth.permissions (id, key) VALUES
  (gen_random_uuid(), 'hmi.control'),
  (gen_random_uuid(), 'hmi.log_trigger'),
  (gen_random_uuid(), 'devices.manage'),
  (gen_random_uuid(), 'analytics.view_full'),
  (gen_random_uuid(), 'analytics.view_basic'),
  (gen_random_uuid(), 'operations_log.view'),
  (gen_random_uuid(), 'users.manage')
ON CONFLICT (key) DO NOTHING;

-- Role-permission mappings
-- admin: all permissions
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM auth.roles r, auth.permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- supervisor: hmi.control, hmi.log_trigger, analytics.view_full, operations_log.view
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM auth.roles r, auth.permissions p
WHERE r.name = 'supervisor' AND p.key IN ('hmi.control', 'hmi.log_trigger', 'analytics.view_full', 'operations_log.view')
ON CONFLICT DO NOTHING;

-- employee: analytics.view_basic, operations_log.view
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM auth.roles r, auth.permissions p
WHERE r.name = 'employee' AND p.key IN ('analytics.view_basic', 'operations_log.view')
ON CONFLICT DO NOTHING;

-- Default admin user (password: "admin123" — bcrypt, cost 10)
INSERT INTO auth.users (id, email, password_hash, full_name, role_id, is_active)
SELECT
  gen_random_uuid(),
  'admin@pineapple-hub.local',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'Admin User',
  (SELECT id FROM auth.roles WHERE name = 'admin'),
  true
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@pineapple-hub.local');

COMMIT;
```

- [x] **Step 3: Commit**

```bash
git add backend/src/migrations/001_schemas.sql backend/src/migrations/002_seed_roles.sql
git commit -m "feat: add PostgreSQL migration files for grading and auth schemas

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Create backend config and database modules

**Files:**
- Create: `backend/src/config.js`
- Create: `backend/src/db.js`

**Interfaces:**
- Produces: `config` object with all env vars, `pool` (pg Pool), `query(sql, params)` helper

- [ ] **Step 1: Write backend/src/config.js**

```js
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

export default {
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pineapple_hub',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-do-not-use-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  mqttBrokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
};
```

- [ ] **Step 2: Write backend/src/db.js**

```js
import pg from 'pg';
import config from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err);
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
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/config.js backend/src/db.js
git commit -m "feat: add backend config and PostgreSQL connection modules

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Create migration runner

**Files:**
- Create: `backend/src/migrations/run.js`

**Interfaces:**
- Consumes: `pool` from `db.js`, SQL files from `migrations/`
- Produces: Runnable migration script (`npm run migrate`)

- [ ] **Step 1: Write backend/src/migrations/run.js**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/migrations/run.js
git commit -m "feat: add PostgreSQL migration runner

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Create Express server entry point

**Files:**
- Create: `backend/src/index.js`

**Interfaces:**
- Consumes: `config`, `pool`/`testConnection` from `db.js`
- Produces: Running Express server on `:3001`

- [ ] **Step 1: Write backend/src/index.js**

```js
import express from 'express';
import cors from 'cors';
import config from './config.js';
import { testConnection } from './db.js';
import { connectMqtt } from './mqtt.js';
import authRoutes from './routes/auth.js';
import deviceRoutes from './routes/devices.js';
import crateLogRoutes from './routes/crateLogs.js';
import hmiRoutes from './routes/hmi.js';

const app = express();

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

// Health check
app.get('/api/health', async (_req, res) => {
  const dbOk = await testConnection();
  res.json({ status: dbOk ? 'ok' : 'degraded', db: dbOk });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/crate-logs', crateLogRoutes);
app.use('/api/hmi', hmiRoutes);

// Start
async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('[Server] WARNING: Database connection failed — starting anyway');
  }

  connectMqtt();

  app.listen(config.port, () => {
    console.log(`[Server] Pineapple Hub API running on http://localhost:${config.port}`);
    console.log(`[Server] Database: ${dbOk ? 'connected' : 'DISCONNECTED'}`);
  });
}

start();
```

- [ ] **Step 2: Verify server starts (will fail on missing route modules — expected)**

```bash
cd backend && node src/index.js
# Expected: crash with "Cannot find module './routes/auth.js'" — confirms entry point is wired
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.js
git commit -m "feat: create Express server entry point with route stubs

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 2: Auth + RBAC

### Task 6: Create JWT auth middleware

**Files:**
- Create: `backend/src/middleware/auth.js`

**Interfaces:**
- Produces: `authenticate` middleware — extracts and verifies JWT, attaches `req.user = { id, email, role, sessionId }`

- [ ] **Step 1: Write backend/src/middleware/auth.js**

```js
import jwt from 'jsonwebtoken';
import config from '../config.js';
import { query } from '../db.js';

/**
 * Express middleware — validates JWT bearer token and attaches user to request.
 * Rejects with 401 if token is missing, invalid, expired, or session is revoked.
 */
export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed authorization header' });
  }

  const token = header.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Check session is still valid (not revoked, not expired)
  const { rows } = await query(
    `SELECT id FROM auth.sessions
     WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [payload.sid]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: 'Session revoked or expired' });
  }

  req.user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    sessionId: payload.sid,
  };

  next();
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/middleware/auth.js
git commit -m "feat: add JWT authentication middleware

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Create RBAC middleware

**Files:**
- Create: `backend/src/middleware/rbac.js`

**Interfaces:**
- Produces: `requirePermission(permissionKey)` → middleware factory that checks `req.user.role` against permission table
- Consumes: `query` from `db.js`

- [ ] **Step 1: Write backend/src/middleware/rbac.js**

```js
import { query } from '../db.js';

// Cached role→permission set, loaded at startup and refreshed on-demand
let rolePermissionCache = null;

/**
 * Load role→permissions map from database.
 * Returns: Map<roleName, Set<permissionKey>>
 */
async function loadPermissionMap() {
  const { rows } = await query(`
    SELECT r.name AS role, p.key AS permission
    FROM auth.roles r
    JOIN auth.role_permissions rp ON rp.role_id = r.id
    JOIN auth.permissions p ON p.id = rp.permission_id
  `);

  const map = new Map();
  for (const { role, permission } of rows) {
    if (!map.has(role)) map.set(role, new Set());
    map.get(role).add(permission);
  }
  return map;
}

/**
 * Check whether a role has a specific permission.
 */
async function roleHasPermission(roleName, permissionKey) {
  if (!rolePermissionCache) {
    rolePermissionCache = await loadPermissionMap();
  }
  const perms = rolePermissionCache.get(roleName);
  return perms ? perms.has(permissionKey) : false;
}

/**
 * Invalidate the permission cache (call after role/permission changes).
 */
export function invalidatePermissionCache() {
  rolePermissionCache = null;
}

/**
 * Middleware factory: require a specific permission to access this route.
 * Must be used AFTER `authenticate` middleware.
 *
 * @param {string} permissionKey — e.g. 'hmi.control', 'devices.manage'
 * @returns {import('express').RequestHandler}
 */
export function requirePermission(permissionKey) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const allowed = await roleHasPermission(req.user.role, permissionKey);
    if (!allowed) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permissionKey,
        role: req.user.role,
      });
    }

    next();
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/middleware/rbac.js
git commit -m "feat: add RBAC permission-check middleware with cached role map

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Create auth routes (login, logout, me)

**Files:**
- Create: `backend/src/routes/auth.js`

**Interfaces:**
- Produces: Express Router
  - `POST /api/auth/login` — body: `{ email, password }` → `{ token, user }`
  - `POST /api/auth/logout` — requires auth, revokes session
  - `GET /api/auth/me` — requires auth → `{ user }`

- [ ] **Step 1: Write backend/src/routes/auth.js**

```js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 * Response: { token: string, user: { id, email, fullName, role } }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const { rows: users } = await query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.is_active, r.name AS role
       FROM auth.users u
       JOIN auth.roles r ON r.id = u.role_id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create session
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    const { rows: sessions } = await query(
      `INSERT INTO auth.sessions (user_id, expires_at)
       VALUES ($1, $2) RETURNING id`,
      [user.id, expiresAt]
    );
    const sessionId = sessions[0].id;

    // Update last login
    await query('UPDATE auth.users SET last_login_at = now() WHERE id = $1', [user.id]);

    // Issue JWT
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        sid: sessionId,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/logout
 * Requires: Authorization header
 * Revokes the current session.
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    await query(
      'UPDATE auth.sessions SET revoked_at = now() WHERE id = $1',
      [req.user.sessionId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[Auth] Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Requires: Authorization header
 * Returns current user info with permissions.
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.last_login_at, r.name AS role
       FROM auth.users u
       JOIN auth.roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const u = rows[0];

    // Get permissions for this user's role
    const { rows: perms } = await query(
      `SELECT p.key
       FROM auth.permissions p
       JOIN auth.role_permissions rp ON rp.permission_id = p.id
       JOIN auth.roles r ON r.id = rp.role_id
       WHERE r.name = $1`,
      [u.role]
    );

    res.json({
      user: {
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        lastLoginAt: u.last_login_at,
        permissions: perms.map((p) => p.key),
      },
    });
  } catch (err) {
    console.error('[Auth] Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/auth.js
git commit -m "feat: add auth routes — login, logout, session validation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Create device CRUD routes

**Files:**
- Create: `backend/src/routes/devices.js`

**Interfaces:**
- Produces: Express Router
  - `GET /api/devices` — all devices (any authenticated user)
  - `POST /api/devices` — create device (requires `devices.manage`)
  - `PUT /api/devices/:id` — update device (requires `devices.manage`)
  - `DELETE /api/devices/:id` — delete device (requires `devices.manage`)

- [ ] **Step 1: Write backend/src/routes/devices.js**

```js
import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

// All device routes require authentication
router.use(authenticate);

/**
 * GET /api/devices
 * Returns all devices, ordered by created_at.
 */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM grading.devices ORDER BY created_at DESC'
    );
    res.json({ devices: rows });
  } catch (err) {
    console.error('[Devices] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/devices
 * Body: { device_id, label, location_path, mqtt_topic_prefix }
 */
router.post('/', requirePermission('devices.manage'), async (req, res) => {
  try {
    const { device_id, label, location_path, mqtt_topic_prefix } = req.body;

    if (!device_id || !label || !location_path || !mqtt_topic_prefix) {
      return res.status(400).json({
        error: 'device_id, label, location_path, and mqtt_topic_prefix are required',
      });
    }

    const { rows } = await query(
      `INSERT INTO grading.devices (device_id, label, location_path, mqtt_topic_prefix)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [device_id, label, location_path, mqtt_topic_prefix]
    );

    res.status(201).json({ device: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A device with that device_id already exists' });
    }
    console.error('[Devices] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/devices/:id
 * Body: any of { device_id, label, location_path, mqtt_topic_prefix, is_active }
 */
router.put('/:id', requirePermission('devices.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['device_id', 'label', 'location_path', 'mqtt_topic_prefix', 'is_active'];
    const sets = [];
    const values = [];
    let idx = 1;

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = $${idx++}`);
        values.push(req.body[f]);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    sets.push(`updated_at = now()`);
    values.push(id);

    const { rows } = await query(
      `UPDATE grading.devices SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ device: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A device with that device_id already exists' });
    }
    console.error('[Devices] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/devices/:id
 */
router.delete('/:id', requirePermission('devices.manage'), async (req, res) => {
  try {
    const { rows } = await query(
      'DELETE FROM grading.devices WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[Devices] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/devices.js
git commit -m "feat: add device CRUD routes with RBAC enforcement

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Create crate log routes

**Files:**
- Create: `backend/src/routes/crateLogs.js`

**Interfaces:**
- Produces: Express Router
  - `GET /api/crate-logs` — query logs with filters (device_id, batch_id, date range, pagination)
  - `POST /api/crate-logs` — create a log entry (called by frontend when OCR+weight+zones align)

- [ ] **Step 1: Write backend/src/routes/crateLogs.js**

```js
import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

/**
 * GET /api/crate-logs
 * Query params: device_id, batch_id, from, to, limit (default 50), offset (default 0)
 * Requires: operations_log.view
 */
router.get('/', requirePermission('operations_log.view'), async (req, res) => {
  try {
    const {
      device_id,
      batch_id,
      from,
      to,
      limit = '50',
      offset = '0',
    } = req.query;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (device_id) {
      conditions.push(`d.device_id = $${idx++}`);
      values.push(device_id);
    }
    if (batch_id) {
      conditions.push(`cl.batch_id ILIKE $${idx++}`);
      values.push(`%${batch_id}%`);
    }
    if (from) {
      conditions.push(`cl.captured_at >= $${idx++}`);
      values.push(from);
    }
    if (to) {
      conditions.push(`cl.captured_at <= $${idx++}`);
      values.push(to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT cl.*, d.device_id AS device_id_text, d.label AS device_label
       FROM grading.crate_logs cl
       JOIN grading.devices d ON d.id = cl.device_id
       ${where}
       ORDER BY cl.captured_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, parseInt(limit, 10), parseInt(offset, 10)]
    );

    // Count total
    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total
       FROM grading.crate_logs cl
       JOIN grading.devices d ON d.id = cl.device_id
       ${where}`,
      values
    );

    res.json({
      logs: rows,
      total: parseInt(countRows[0].total, 10),
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  } catch (err) {
    console.error('[CrateLogs] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/crate-logs
 * Body: { device_id, batch_id?, crate_weight_g, grade, zone1_status, zone2_status,
 *         ocr_extracted_id?, ocr_confidence?, capture_trigger, captured_at }
 * Requires: any authenticated user (auto_zone capture) or hmi.log_trigger (manual_button)
 */
router.post('/', async (req, res, next) => {
  // manual_button requires explicit permission; auto_zone is allowed for any auth user
  if (req.body.capture_trigger === 'manual_button') {
    return requirePermission('hmi.log_trigger')(req, res, next);
  }
  next();
}, async (req, res) => {
  try {
    const {
      device_id,
      batch_id = null,
      crate_weight_g,
      grade,
      zone1_status,
      zone2_status,
      ocr_extracted_id = null,
      ocr_confidence = null,
      capture_trigger,
      captured_at,
    } = req.body;

    // Validate required fields
    if (!device_id || crate_weight_g == null || !grade || !zone1_status || !zone2_status || !capture_trigger) {
      return res.status(400).json({
        error: 'device_id, crate_weight_g, grade, zone1_status, zone2_status, and capture_trigger are required',
      });
    }

    // Resolve device UUID from device_id text
    const { rows: devices } = await query(
      'SELECT id FROM grading.devices WHERE device_id = $1',
      [device_id]
    );

    if (devices.length === 0) {
      return res.status(400).json({ error: `Device not found: ${device_id}` });
    }

    const deviceUuid = devices[0].id;

    const { rows } = await query(
      `INSERT INTO grading.crate_logs
       (device_id, batch_id, crate_weight_g, grade, zone1_status_at_capture,
        zone2_status_at_capture, ocr_extracted_id, ocr_confidence,
        capture_trigger, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        deviceUuid,
        batch_id,
        crate_weight_g,
        grade,
        zone1_status,
        zone2_status,
        ocr_extracted_id,
        ocr_confidence,
        capture_trigger,
        captured_at || new Date().toISOString(),
      ]
    );

    res.status(201).json({ log: rows[0] });
  } catch (err) {
    console.error('[CrateLogs] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/crateLogs.js
git commit -m "feat: add crate log query and creation routes

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Create HMI command routes + backend MQTT client

**Files:**
- Create: `backend/src/routes/hmi.js`
- Create: `backend/src/mqtt.js`

**Interfaces:**
- Produces: `POST /api/hmi/command` (requires `hmi.control` or `hmi.log_trigger`)
- Produces: `connectMqtt()` — connects to broker, exports `publishCommand(deviceId, action)`

- [ ] **Step 1: Write backend/src/mqtt.js**

```js
import mqtt from 'mqtt';
import config from './config.js';

let client = null;

/**
 * Connect to the MQTT broker and set up subscriptions.
 * Called once at server startup.
 */
export function connectMqtt() {
  client = mqtt.connect(config.mqttBrokerUrl, {
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    keepalive: 10,
  });

  client.on('connect', () => {
    console.log('[MQTT] Backend connected to broker');
  });

  client.on('error', (err) => {
    console.error('[MQTT] Backend error:', err);
  });

  client.on('close', () => {
    console.warn('[MQTT] Backend disconnected');
  });
}

/**
 * Publish a command to a device's command topic.
 * Topic: pineapple/{device_id}/command
 * Payload: { action: 'power' | 'tare' | 'mode' | 'log_trigger' }
 *
 * @param {string} deviceId — e.g. 'scale1'
 * @param {'power' | 'tare' | 'mode' | 'log_trigger'} action
 */
export function publishCommand(deviceId, action) {
  if (!client || !client.connected) {
    console.warn('[MQTT] Cannot publish — not connected');
    return false;
  }

  const topic = `pineapple/${deviceId}/command`;
  const payload = JSON.stringify({ action });
  client.publish(topic, payload, { qos: 1 });
  console.log(`[MQTT] Published ${topic} → ${payload}`);
  return true;
}
```

- [ ] **Step 2: Write backend/src/routes/hmi.js**

```js
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { publishCommand } from '../mqtt.js';
import { query } from '../db.js';

const router = Router();

router.use(authenticate);

// Permission mapping per action
const ACTION_PERMISSION = {
  power: 'hmi.control',
  tare: 'hmi.control',
  mode: 'hmi.control',
  log_trigger: 'hmi.log_trigger',
};

/**
 * POST /api/hmi/command
 * Body: { device_id: string, action: 'power' | 'tare' | 'mode' | 'log_trigger' }
 *
 * Permission is checked per-action:
 *   power/tare/mode → hmi.control
 *   log_trigger     → hmi.log_trigger
 */
router.post('/command', async (req, res) => {
  try {
    const { device_id, action } = req.body;

    if (!device_id || !action) {
      return res.status(400).json({ error: 'device_id and action are required' });
    }

    const validActions = ['power', 'tare', 'mode', 'log_trigger'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}` });
    }

    // Check permission for this action
    const permKey = ACTION_PERMISSION[action];
    const { requirePermission: rp } = await import('../middleware/rbac.js');
    const permMiddleware = rp(permKey);

    // Run the permission check inline
    let permError = null;
    const mockRes = {
      status: (code) => ({ json: (body) => { permError = { code, body }; } }),
    };
    let nextCalled = false;
    await permMiddleware(req, mockRes, () => { nextCalled = true; });

    if (!nextCalled || permError) {
      return res.status(permError?.code || 403).json(permError?.body || { error: 'Permission denied' });
    }

    // Verify device exists
    const { rows: devices } = await query(
      'SELECT id FROM grading.devices WHERE device_id = $1',
      [device_id]
    );

    if (devices.length === 0) {
      return res.status(404).json({ error: `Device not found: ${device_id}` });
    }

    // Publish command
    const published = publishCommand(device_id, action);
    if (!published) {
      return res.status(503).json({ error: 'MQTT broker not connected' });
    }

    // Log the command
    const { rows: logRows } = await query(
      `INSERT INTO grading.hmi_command_log (device_id, user_id, action)
       VALUES ($1, $2, $3) RETURNING id`,
      [devices[0].id, req.user.id, action]
    );

    res.json({
      ok: true,
      command_id: logRows[0].id,
      device_id,
      action,
      status: 'pending',
    });
  } catch (err) {
    console.error('[HMI] Command error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

Wait — the inline permission check in the HMI route is awkward. Let me fix this with a cleaner approach.

- [ ] **Step 3: Refactor HMI route to use a cleaner permission pattern**

```js
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { publishCommand } from '../mqtt.js';
import { query } from '../db.js';

const router = Router();

router.use(authenticate);

/**
 * Helper: check a permission dynamically. Returns true if allowed, false otherwise.
 * @param {object} req — Express request (must have req.user from authenticate)
 * @param {string} permissionKey
 * @returns {Promise<boolean>}
 */
async function checkPermission(req, permissionKey) {
  const { roleHasPermission } = await import('../middleware/rbac.js');
  return roleHasPermission ? roleHasPermission(req.user.role, permissionKey) : false;
}

/**
 * POST /api/hmi/command
 * Body: { device_id: string, action: 'power' | 'tare' | 'mode' | 'log_trigger' }
 */
router.post('/command', async (req, res) => {
  try {
    const { device_id, action } = req.body;

    if (!device_id || !action) {
      return res.status(400).json({ error: 'device_id and action are required' });
    }

    const validActions = ['power', 'tare', 'mode', 'log_trigger'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`,
      });
    }

    // Map action to required permission
    const permKey =
      action === 'log_trigger' ? 'hmi.log_trigger' : 'hmi.control';

    // Import RBAC check dynamically (avoids circular dependency at module load)
    const { roleHasPermission } = await import('../middleware/rbac.js');
    const allowed = roleHasPermission ? await roleHasPermission(req.user.role, permKey) : false;

    if (!allowed) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permKey,
        role: req.user.role,
      });
    }

    // Verify device exists
    const { rows: devices } = await query(
      'SELECT id FROM grading.devices WHERE device_id = $1',
      [device_id]
    );

    if (devices.length === 0) {
      return res.status(404).json({ error: `Device not found: ${device_id}` });
    }

    // Publish command to MQTT
    const published = publishCommand(device_id, action);
    if (!published) {
      return res.status(503).json({ error: 'MQTT broker not connected' });
    }

    // Log the command
    const { rows: logRows } = await query(
      `INSERT INTO grading.hmi_command_log (device_id, user_id, action)
       VALUES ($1, $2, $3) RETURNING id`,
      [devices[0].id, req.user.id, action]
    );

    res.json({
      ok: true,
      command_id: logRows[0].id,
      device_id,
      action,
      status: 'pending',
    });
  } catch (err) {
    console.error('[HMI] Command error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

Note: The dynamic `import()` for RBAC is awkward. Let me instead expose a standalone function from the RBAC module. Update `backend/src/middleware/rbac.js` to also export `roleHasPermission`:

- [ ] **Step 4: Update rbac.js to export roleHasPermission directly**

In `backend/src/middleware/rbac.js`, add this export before the `requirePermission` function:

```js
/**
 * Check whether a role has a specific permission (standalone, non-middleware).
 * @param {string} roleName
 * @param {string} permissionKey
 * @returns {Promise<boolean>}
 */
export async function roleHasPermission(roleName, permissionKey) {
  if (!rolePermissionCache) {
    rolePermissionCache = await loadPermissionMap();
  }
  const perms = rolePermissionCache.get(roleName);
  return perms ? perms.has(permissionKey) : false;
}
```

Then the HMI route can do a clean import: `import { roleHasPermission } from '../middleware/rbac.js';`

- [ ] **Step 5: Commit**

```bash
git add backend/src/mqtt.js backend/src/routes/hmi.js
git commit -m "feat: add HMI command route with per-action RBAC and backend MQTT client

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 3: Frontend Auth + RBAC Integration

### Task 12: Create permissions constants

**Files:**
- Create: `src/constants/permissions.js`

- [ ] **Step 1: Write src/constants/permissions.js**

```js
/**
 * Permission key constants — mirrors auth.permissions.key values in the database.
 * Used client-side for conditional UI rendering (RBAC-gated visibility).
 *
 * NOTE: Client-side hiding is NOT access control. Every route/action is also
 * enforced server-side by the backend middleware. These constants gate UI only.
 */

export const PERM = {
  HMI_CONTROL:        'hmi.control',
  HMI_LOG_TRIGGER:    'hmi.log_trigger',
  DEVICES_MANAGE:     'devices.manage',
  ANALYTICS_VIEW_FULL: 'analytics.view_full',
  ANALYTICS_VIEW_BASIC: 'analytics.view_basic',
  OPERATIONS_LOG_VIEW: 'operations_log.view',
  USERS_MANAGE:       'users.manage',
};
```

- [ ] **Step 2: Commit**

```bash
git add src/constants/permissions.js
git commit -m "feat: add client-side permission key constants

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: Create useApi hook

**Files:**
- Create: `src/hooks/useApi.js`

**Interfaces:**
- Produces: `useApi()` → `{ get, post, put, del, token }` — fetch wrapper that attaches auth header
- Reads token from localStorage

- [ ] **Step 1: Write src/hooks/useApi.js**

```js
import { useCallback, useMemo } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Hook: returns authenticated fetch helpers.
 * Reads JWT from localStorage and attaches it as Bearer token.
 * Components should use AuthContext for login state; this hook is for API calls.
 */
export default function useApi() {
  const token = useMemo(() => localStorage.getItem('token'), []);

  /**
   * Base fetch wrapper — adds auth header and handles common errors.
   */
  const request = useCallback(
    async (path, options = {}) => {
      const url = `${API_BASE}${path}`;
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      };

      const res = await fetch(url, { ...options, headers });

      if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Don't redirect here — let AuthContext handle it
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Request failed: ${res.status}`);
      }

      return data;
    },
    [token]
  );

  const get = useCallback((path) => request(path), [request]);
  const post = useCallback((path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }), [request]);
  const put = useCallback((path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }), [request]);
  const del = useCallback((path) => request(path, { method: 'DELETE' }), [request]);

  return { get, post, put, del, token };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useApi.js
git commit -m "feat: add authenticated API client hook

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 14: Create AuthContext

**Files:**
- Create: `src/context/AuthContext.jsx`

**Interfaces:**
- Produces: `<AuthProvider>` wrapping component
- Exposes: `{ user, permissions, token, login, logout, isAuthenticated, hasPermission, isAdmin, isSupervisor, isEmployee }`

- [ ] **Step 1: Write src/context/AuthContext.jsx**

```jsx
import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [permissions, setPermissions] = useState(() => {
    try {
      const saved = localStorage.getItem('permissions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  const isAuthenticated = !!token && !!user;

  // Verify token on mount
  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error('Session invalid');
          return res.json();
        })
        .then((data) => {
          setUser(data.user);
          setPermissions(data.user.permissions || []);
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('permissions', JSON.stringify(data.user.permissions || []));
        })
        .catch(() => {
          // Token invalid or expired — clear state
          setUser(null);
          setPermissions([]);
          setToken(null);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('permissions');
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // Get full user info with permissions
    const meRes = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    const meData = await meRes.json();

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(meData.user));
    localStorage.setItem('permissions', JSON.stringify(meData.user.permissions || []));

    setToken(data.token);
    setUser(meData.user);
    setPermissions(meData.user.permissions || []);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Best-effort logout
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('permissions');
    setToken(null);
    setUser(null);
    setPermissions([]);
  }, [token]);

  const hasPermission = useCallback(
    (permKey) => permissions.includes(permKey),
    [permissions]
  );

  const isAdmin = user?.role === 'admin';
  const isSupervisor = user?.role === 'supervisor';
  const isEmployee = user?.role === 'employee';

  const value = useMemo(
    () => ({
      user,
      permissions,
      token,
      login,
      logout,
      isAuthenticated,
      hasPermission,
      isAdmin,
      isSupervisor,
      isEmployee,
    }),
    [user, permissions, token, login, logout, isAuthenticated, hasPermission, isAdmin, isSupervisor, isEmployee]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/context/AuthContext.jsx
git commit -m "feat: add AuthContext with login/logout/permission helpers

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 15: Create LoginPage component

**Files:**
- Create: `src/components/LoginPage.jsx`

- [ ] **Step 1: Write src/components/LoginPage.jsx**

```jsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already logged in — redirect
  if (isAuthenticated) {
    navigate('/', { replace: true });
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="bg-surface-container border border-outline-variant rounded-xl p-xl w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-xl">
          <h1 className="font-headline-md text-headline-md font-bold text-primary mb-xs">
            Pineapple Hub
          </h1>
          <p className="font-label-caps text-label-caps text-on-surface-variant">
            Bukidnon Operations — Sign In
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-error-container border border-error/30 rounded p-sm mb-lg">
            <p className="text-on-error-container font-body-md text-body-md">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-lg">
          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant block mb-xs">
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="admin@pineapple-hub.local"
              className="w-full bg-surface-container-high border border-outline-variant rounded px-md py-sm
                         text-on-surface font-body-md placeholder-on-surface-variant/50
                         focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>

          <div>
            <label className="font-label-caps text-label-caps text-on-surface-variant block mb-xs">
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              className="w-full bg-surface-container-high border border-outline-variant rounded px-md py-sm
                         text-on-surface font-body-md placeholder-on-surface-variant/50
                         focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary font-label-caps font-bold py-sm rounded
                       hover:brightness-110 active:scale-[0.98] transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'SIGNING IN...' : 'SIGN IN'}
          </button>
        </form>

        <p className="font-data-mono text-[10px] text-on-surface-variant/50 mt-lg text-center">
          Default: admin@pineapple-hub.local / admin123
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LoginPage.jsx
git commit -m "feat: add login page with email/password form

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 16: Create ProtectedRoute component

**Files:**
- Create: `src/components/ProtectedRoute.jsx`

- [ ] **Step 1: Write src/components/ProtectedRoute.jsx**

```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Route guard: redirects to /login if not authenticated.
 * Optionally checks a specific permission (shows "access denied" if missing).
 *
 * @param {{ children: React.ReactNode, permission?: string }} props
 */
export default function ProtectedRoute({ children, permission }) {
  const { isAuthenticated, hasPermission } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (permission && !hasPermission(permission)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center bg-surface-container border border-outline-variant rounded-xl p-xl max-w-md">
          <span className="material-symbols-outlined text-5xl text-error mb-md block">
            gavel
          </span>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-sm">
            Access Denied
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Your account does not have permission to access this page.
          </p>
          <p className="font-data-mono text-xs text-on-surface-variant/50 mt-sm">
            Required: {permission}
          </p>
        </div>
      </div>
    );
  }

  return children;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ProtectedRoute.jsx
git commit -m "feat: add ProtectedRoute with auth and permission gating

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 17: Wire auth into App.jsx and main.jsx

**Files:**
- Modify: `src/main.jsx` — wrap with AuthProvider
- Modify: `src/App.jsx` — add login route, protect existing routes

- [ ] **Step 1: Update src/main.jsx**

Read the current file (already done — see above). Add AuthProvider:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 2: Update src/App.jsx**

The current App.jsx renders Sidebar+TopBar+Routes unconditionally. Update to:
- Add a `/login` route (no chrome — just the LoginPage)
- Wrap authenticated routes with ProtectedRoute
- Pass user info to Sidebar

```jsx
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import LoginPage from './components/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import LiveGrading from './screens/LiveGrading';
import OperationsLog from './screens/OperationsLog';
import Analytics from './screens/Analytics';
import DeviceManagement from './screens/DeviceManagement';
import Reports from './screens/Reports';
import OCRPipeline from './screens/OCRPipeline';
import useMqtt from './hooks/useMqtt';
import { useAuth } from './context/AuthContext';
import { PERM } from './constants/permissions';

function getTopBarVariant(pathname) {
  if (pathname === '/devices') return 'devices';
  if (pathname === '/reports') return 'reports';
  return 'default';
}

/** Shell layout for authenticated pages (sidebar + topbar + main) */
function AppShell({ children }) {
  const location = useLocation();
  const {
    connectionState,
    availability,
    weightG,
    grade,
    status,
    dataValid,
    zone1,
    zone2,
    captureArmed,
    switchStates,
    publishSwitchCommand,
  } = useMqtt();

  const topBarVariant = getTopBarVariant(location.pathname);

  const mqttContext = {
    connectionState,
    availability,
    weightG,
    grade,
    status,
    dataValid,
    zone1,
    zone2,
    captureArmed,
    switchStates,
    publishSwitchCommand,
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar availability={availability} />
      <TopBar variant={topBarVariant} connectionState={connectionState} />
      <main className="ml-60 p-lg min-h-[calc(100vh-64px)] bg-background">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public route — no shell */}
      <Route path="/login" element={<LoginPage />} />

      {/* Authenticated routes — wrapped in AppShell + ProtectedRoute */}
      <Route path="/" element={
        <ProtectedRoute>
          <AppShell><LiveGrading mqttContext={null} /></AppShell>
        </ProtectedRoute>
      } />
      {/* ... other routes ... */}
    </Routes>
  );
}
```

Wait — this approach breaks because `useMqtt()` is called inside `AppShell`, but the MQTT context needs to flow to `LiveGrading`. Let me restructure properly.

Better approach: Keep the shell/layout in App.jsx but wrap routes individually. Also, `useMqtt` must be called unconditionally (rules of hooks) but the MQTT context only matters for authenticated pages.

Actually, the simplest approach: the login page is a completely separate route that doesn't render the shell. All other routes render the shell with MQTT hook + protected route wrapper. But `useMqtt` must be called at the top level...

Let me restructure:

```jsx
import { Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import LoginPage from './components/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import LiveGrading from './screens/LiveGrading';
import OperationsLog from './screens/OperationsLog';
import Analytics from './screens/Analytics';
import DeviceManagement from './screens/DeviceManagement';
import Reports from './screens/Reports';
import OCRPipeline from './screens/OCRPipeline';
import useMqtt from './hooks/useMqtt';
import { useAuth } from './context/AuthContext';
import { PERM } from './constants/permissions';

function getTopBarVariant(pathname) {
  if (pathname === '/devices') return 'devices';
  if (pathname === '/reports') return 'reports';
  return 'default';
}

export default function App() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const {
    connectionState,
    availability,
    weightG,
    grade,
    status,
    dataValid,
    zone1,
    zone2,
    captureArmed,
    switchStates,
    publishSwitchCommand,
  } = useMqtt();

  const topBarVariant = getTopBarVariant(location.pathname);

  const mqttContext = {
    connectionState,
    availability,
    weightG,
    grade,
    status,
    dataValid,
    zone1,
    zone2,
    captureArmed,
    switchStates,
    publishSwitchCommand,
  };

  // Login page — no shell
  if (location.pathname === '/login') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar availability={availability} />
      <TopBar variant={topBarVariant} connectionState={connectionState} />
      <main className="ml-60 p-lg min-h-[calc(100vh-64px)] bg-background">
        <Routes>
          <Route path="/" element={
            <ProtectedRoute><LiveGrading mqtt={mqttContext} /></ProtectedRoute>
          } />
          <Route path="/operations-log" element={
            <ProtectedRoute permission={PERM.OPERATIONS_LOG_VIEW}><OperationsLog mqtt={mqttContext} /></ProtectedRoute>
          } />
          <Route path="/analytics" element={
            <ProtectedRoute permission={PERM.ANALYTICS_VIEW_BASIC}><Analytics mqtt={mqttContext} /></ProtectedRoute>
          } />
          <Route path="/devices" element={
            <ProtectedRoute><DeviceManagement mqtt={mqttContext} /></ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute><Reports mqtt={mqttContext} /></ProtectedRoute>
          } />
          <Route path="/ocr-pipeline" element={
            <ProtectedRoute><OCRPipeline /></ProtectedRoute>
          } />
          {/* Catch-all redirect */}
          <Route path="*" element={<LiveGrading mqtt={mqttContext} />} />
        </Routes>
      </main>
    </div>
  );
}
```

This is cleaner — `useMqtt()` is always called (no conditional hooks), but the login page renders separately without the shell.

- [ ] **Step 3: Verify build**

```bash
npm run build
# Expected: may have errors from new imports — fix any issues
```

- [ ] **Step 4: Commit**

```bash
git add src/main.jsx src/App.jsx
git commit -m "feat: integrate AuthProvider, login route, and protected routes

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 4: HMI Panel + MQTT Command Topics

### Task 18: Add command topic constants

**Files:**
- Modify: `src/constants/mqttTopics.js`

- [ ] **Step 1: Add command topic to mqttTopics.js**

At the end of the file, add:

```js
/* ── Device command + state (Part 3: HMI remote control) ── */

/** App → Firmware — command payload. Not retained, QoS 1 */
export function deviceCommandTopic(deviceId) {
  return `pineapple/${deviceId}/command`;
}

/** Firmware → App — device state confirmation. Not retained, QoS 1 */
export const TOPIC_SCALE1_DEVICE_STATE = 'pineapple/scale1/device_state';
```

- [ ] **Step 2: Commit**

```bash
git add src/constants/mqttTopics.js
git commit -m "feat: add MQTT command and device_state topic constants

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 19: Add device_state subscription and command publish to useMqtt

**Files:**
- Modify: `src/hooks/useMqtt.js`

- [ ] **Step 1: Add device_state state, subscription, and command publisher**

Add after the existing switch state (line ~70):

```js
/* ── Device state for HMI confirmation ── */
const [deviceState, setDeviceState] = useState(
  /** @type {{ power?: 'on'|'off', mode?: string, tare?: boolean } | null} */ (null)
);
```

Add in the connect handler (after the HMI subscription):

```js
client.subscribe(TOPIC_SCALE1_DEVICE_STATE, { qos: 1 }, (err) => {
  if (err) console.error('[MQTT] Subscribe device_state error:', err);
});
```

Add in handleMessage (before the HMI switch state handler):

```js
if (topic === TOPIC_SCALE1_DEVICE_STATE) {
  try {
    setDeviceState(JSON.parse(str));
  } catch (e) {
    console.error('[MQTT] Failed to parse device_state:', e);
  }
  return;
}
```

Add the command publisher function (after `publishSwitchCommand`):

```js
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
```

Add `deviceState` and `publishDeviceCommand` to the return object.

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useMqtt.js
git commit -m "feat: add device_state subscription and command publisher to useMqtt

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 20: Create HMIPanel component

**Files:**
- Create: `src/components/HMIPanel.jsx`

**Interfaces:**
- Consumes: `deviceState`, `publishDeviceCommand` from MQTT, `hasPermission` from AuthContext, `isLive` boolean
- Produces: Real HMI panel with Power, Tare, Mode, Log Trigger buttons + RBAC gating + pending/timeout states

- [ ] **Step 1: Write HMIPanel.jsx**

```jsx
import { useState, useEffect, useRef } from 'react';
import StatusPill from './StatusPill';
import { useAuth } from '../context/AuthContext';
import { PERM } from '../constants/permissions';

const TIMEOUT_MS = 5000;

/**
 * HMI Panel — replaces the placeholder SwitchPanel with real device controls.
 * Each button publishes a command over MQTT and waits for device_state confirmation.
 *
 * RBAC: employees see nothing; supervisors see all controls; admins see all controls.
 */
export default function HMIPanel({ deviceState, publishDeviceCommand, isLive }) {
  const { hasPermission } = useAuth();

  const canControl = hasPermission(PERM.HMI_CONTROL);
  const canLogTrigger = hasPermission(PERM.HMI_LOG_TRIGGER);

  // Hide entire panel from employees
  if (!canControl && !canLogTrigger) {
    return null;
  }

  return (
    <div className="bg-surface-container border border-outline-variant rounded p-lg">
      <div className="flex items-center justify-between mb-lg">
        <h3 className="font-label-caps text-label-caps text-on-surface-variant">
          DEVICE CONTROLS — SCALE 04
        </h3>
        <StatusPill
          variant={isLive ? 'online' : 'offline'}
          label={isLive ? 'MQTT LIVE' : 'MQTT OFFLINE'}
        />
      </div>

      <div className="grid grid-cols-2 gap-sm">
        {canControl && (
          <>
            <HMIButton
              label="POWER"
              icon="power_settings_new"
              action="power"
              currentState={deviceState?.power}
              publish={publishDeviceCommand}
              isLive={isLive}
              onLabel="ON"
              offLabel="OFF"
            />
            <HMIButton
              label="TARE"
              icon="scale"
              action="tare"
              currentState={deviceState?.tare ? 'on' : 'off'}
              publish={publishDeviceCommand}
              isLive={isLive}
              isMomentary
            />
            <HMIButton
              label="MODE"
              icon="tune"
              action="mode"
              currentState={deviceState?.mode || 'auto'}
              publish={publishDeviceCommand}
              isLive={isLive}
              displayValue={deviceState?.mode || 'AUTO'}
            />
          </>
        )}
        {canLogTrigger && (
          <HMIButton
            label="LOG TRIGGER"
            icon="note_add"
            action="log_trigger"
            currentState={null}
            publish={publishDeviceCommand}
            isLive={isLive}
            isMomentary
          />
        )}
      </div>

      <p className="font-body-md text-[11px] text-on-surface-variant/50 mt-md text-center">
        Commands are sent over MQTT and confirmed via device_state
      </p>
    </div>
  );
}

/**
 * Single HMI button with pending/timeout state.
 */
function HMIButton({
  label, icon, action, currentState, publish, isLive,
  isMomentary = false, onLabel = 'ON', offLabel = 'OFF', displayValue,
}) {
  const [pending, setPending] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const prevState = useRef(currentState);
  const timeoutRef = useRef(null);

  // Clear pending when device state changes
  useEffect(() => {
    if (pending && currentState !== prevState.current) {
      setPending(false);
      setTimedOut(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    prevState.current = currentState;
  }, [currentState, pending]);

  function handleClick() {
    if (!isLive || pending) return;
    setPending(true);
    setTimedOut(false);
    publish(action);

    timeoutRef.current = setTimeout(() => {
      setPending(false);
      setTimedOut(true);
    }, TIMEOUT_MS);
  }

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const isActive = currentState === 'on' || currentState === true;

  return (
    <button
      onClick={handleClick}
      disabled={!isLive || pending}
      className={`flex flex-col items-center gap-xs p-md rounded border transition-all
        ${isActive && !isMomentary
          ? 'bg-[#10B981]/10 border-[#10B981]/30'
          : 'bg-surface-container-low border-outline-variant hover:border-primary/50'
        }
        ${timedOut ? 'border-[#EF4444]/50 bg-[#EF4444]/5' : ''}
        ${pending ? 'border-tertiary/50 animate-pulse' : ''}
        disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      <span className={`material-symbols-outlined text-2xl ${
        timedOut ? 'text-[#EF4444]' : isActive ? 'text-[#10B981]' : 'text-on-surface-variant'
      }`}>
        {icon}
      </span>
      <span className="font-label-caps text-[10px] text-on-surface-variant">{label}</span>
      {pending ? (
        <StatusPill variant="pending" label="PENDING" />
      ) : timedOut ? (
        <StatusPill variant="offline" label="TIMEOUT" />
      ) : isMomentary ? (
        <span className="font-data-mono text-xs text-on-surface-variant">PRESS</span>
      ) : (
        <span className={`font-data-mono text-xs ${isActive ? 'text-[#10B981]' : 'text-on-surface-variant'}`}>
          {displayValue || (isActive ? onLabel : offLabel)}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/HMIPanel.jsx
git commit -m "feat: add HMIPanel with RBAC-gated device controls and timeout handling

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 21: Wire HMIPanel into DeviceManagement, replace SwitchPanel

**Files:**
- Modify: `src/screens/DeviceManagement.jsx`

- [ ] **Step 1: Update DeviceManagement.jsx**

Replace the `<SwitchPanel>` import and usage with `<HMIPanel>`. The existing SwitchPanel is a placeholder — HMIPanel replaces it.

Changes:
1. Replace `import SwitchPanel from '../components/SwitchPanel';` with `import HMIPanel from '../components/HMIPanel';`
2. In the mqtt destructuring, add `deviceState` and `publishDeviceCommand`
3. Replace `<SwitchPanel ...>` with `<HMIPanel deviceState={deviceState} publishDeviceCommand={publishDeviceCommand} isLive={isLive} />`

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/screens/DeviceManagement.jsx
git commit -m "feat: replace placeholder SwitchPanel with real HMIPanel on /devices

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 5: OCR/CNN Pipeline → Crate Log Wiring

### Task 22: Wire OCR pipeline results to crate-log creation

**Files:**
- Modify: `src/screens/OCRPipeline.jsx`

**Logic:** When the OCR pipeline produces a result AND MQTT has valid weight + zones aligned, POST to `/api/crate-logs` to create a `grading.crate_logs` row.

Since the OCR pipeline page has access to WebSocket OCR results but NOT MQTT data (it doesn't receive mqtt context from App.jsx — see the route: `<OCRPipeline />` with no mqtt prop), we need to either:
1. Pass MQTT context to OCRPipeline
2. Create a dedicated hook/callback approach
3. Have the backend do the correlation (subscribe to MQTT itself)

Best approach: Pass MQTT context to OCRPipeline route AND create a `useCrateLogCapture` hook that monitors MQTT weight/zones + OCR results, and fires the API call when conditions align.

First, let's update App.jsx to pass MQTT context to OCRPipeline, then create the capture hook.

Actually, the simplest approach: the backend's `POST /api/crate-logs` endpoint is called by the OCR pipeline screen when the three conditions align. The frontend OCRPipeline screen needs access to MQTT weight and zone state. But currently it doesn't have it.

Solution: pass `mqttContext` to OCRPipeline via the route in App.jsx. Then create a `useCrateLogCapture` hook.

- [ ] **Step 1: Pass mqttContext to OCRPipeline in App.jsx**

Change the OCRPipeline route from:
```jsx
<Route path="/ocr-pipeline" element={<ProtectedRoute><OCRPipeline /></ProtectedRoute>} />
```
to:
```jsx
<Route path="/ocr-pipeline" element={<ProtectedRoute><OCRPipeline mqtt={mqttContext} /></ProtectedRoute>} />
```

- [ ] **Step 2: Create useCrateLogCapture hook**

Create `src/hooks/useCrateLogCapture.js`:

```js
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
```

- [ ] **Step 3: Wire hook into OCRPipeline.jsx**

In OCRPipeline, accept the `mqtt` prop and call the hook:

```jsx
import useCrateLogCapture from '../hooks/useCrateLogCapture';

export default function OCRPipeline({ mqtt }) {
  // ... existing code ...

  // Wire OCR results to crate log creation
  const latestOcr = ocrResults.length > 0 ? ocrResults[0] : null;
  useCrateLogCapture(mqtt, latestOcr);

  // ... rest of component ...
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCrateLogCapture.js src/screens/OCRPipeline.jsx src/App.jsx
git commit -m "feat: wire OCR pipeline results to crate_log creation via backend API

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 6: Removals + Refinements

### Task 23: Remove Environment card from LiveGrading

**Files:**
- Modify: `src/screens/LiveGrading.jsx`

- [ ] **Step 1: Delete the Environment card section**

Remove lines ~323-355 (the entire "Environment Monitor" `<div>` block with AMB. TEMP and HUMIDITY).

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/screens/LiveGrading.jsx
git commit -m "refactor: remove Environment card (no sensor hardware in scope)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 24: Remove Analytics status pills and bottom bar elements

**Files:**
- Modify: `src/screens/Analytics.jsx`

- [ ] **Step 1: Remove the "MQTT OFFLINE" StatusPill under the header**

In the header section, replace:
```jsx
{isLive ? (
  <>
    <span className="w-2 h-2 rounded-full bg-[#10B981]" />
    <span className="font-label-caps text-label-caps text-[#10B981]">
      SYSTEM ACTIVE
    </span>
  </>
) : (
  <StatusPill variant="offline" label="MQTT OFFLINE" />
)}
```
With just:
```jsx
{isLive && (
  <>
    <span className="w-2 h-2 rounded-full bg-[#10B981]" />
    <span className="font-label-caps text-label-caps text-[#10B981]">
      SYSTEM ACTIVE
    </span>
  </>
)}
```

- [ ] **Step 2: Remove the Bottom Status Bar entirely**

Delete the entire `<div className="mt-lg bg-surface-container-low border...">` block (lines 99-119) containing "Line Speed" and "Ambient".

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/screens/Analytics.jsx
git commit -m "refactor: remove Analytics MQTT OFFLINE pill, line status, ambient status

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 25: Permission-gate Analytics (employee = basic, admin/supervisor = full)

**Files:**
- Modify: `src/screens/Analytics.jsx`

**Logic:** One component tree. Employee sees a simplified subset; admin/supervisor see everything. No duplicated screens.

- [ ] **Step 1: Add permission-gated sections to Analytics**

Wrap the full-view sections (Throughput by Grade, Grade Distribution donut, System Uptime) with a permission check:

```jsx
import { useAuth } from '../context/AuthContext';
import { PERM } from '../constants/permissions';

export default function Analytics({ mqtt }) {
  const { connectionState } = mqtt;
  const isLive = connectionState === 'connected';
  const { hasPermission } = useAuth();
  const canViewFull = hasPermission(PERM.ANALYTICS_VIEW_FULL);
  const canViewBasic = hasPermission(PERM.ANALYTICS_VIEW_BASIC);

  // If user lacks even basic analytics, show access denied
  if (!canViewBasic) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-md block">
            analytics
          </span>
          <p className="font-body-md text-body-md text-on-surface-variant">
            You do not have access to analytics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      {/* Header — same for all roles */}
      <div className="mb-lg flex justify-between items-end">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-xs">
            Performance Analytics
          </h2>
          {isLive && (
            <div className="flex items-center gap-sm">
              <span className="w-2 h-2 rounded-full bg-[#10B981]" />
              <span className="font-label-caps text-label-caps text-[#10B981]">
                SYSTEM ACTIVE
              </span>
            </div>
          )}
        </div>
        {canViewFull && (
          <div className="flex gap-sm">
            <button className="px-md py-xs border border-outline-variant rounded font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-high transition-colors">
              LAST 7 DAYS
            </button>
            <button className="px-md py-xs bg-primary-container text-on-primary-container rounded font-label-caps text-label-caps font-bold">
              EXPORT DATA
            </button>
          </div>
        )}
      </div>

      {/* Chart grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        {/* Avg Crate Weight — visible to all roles */}
        <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col">
          <div className="flex justify-between items-start mb-md">
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-xs">
                Avg Crate Weight Stability Trend
              </h3>
              <span className="font-data-mono text-2xl text-on-surface-variant/30 tabular-nums">
                --.-kg
              </span>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">monitoring</span>
          </div>
          <EmptyChartPlaceholder />
        </div>

        {/* Full-analytics charts — admin/supervisor only */}
        {canViewFull && (
          <>
            <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col">
              <div className="flex justify-between items-start mb-md">
                <div>
                  <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-xs">
                    Throughput by Grade (7 Days)
                  </h3>
                  <span className="font-data-mono text-2xl text-on-surface-variant/30 tabular-nums">
                    -- Crates
                  </span>
                </div>
              </div>
              <EmptyChartPlaceholder />
            </div>

            <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-md text-center">
                Overall Grade Distribution %
              </h3>
              <EmptyChartPlaceholder />
            </div>

            <div className="bg-surface-container border border-outline-variant rounded p-lg flex flex-col">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-md text-center">
                System Uptime Score
              </h3>
              <EmptyChartPlaceholder />
            </div>
          </>
        )}
      </div>

      {/* Employee simplification note */}
      {!canViewFull && (
        <p className="font-body-md text-[11px] text-on-surface-variant/50 mt-lg text-center">
          Basic view — contact a supervisor for detailed analytics access.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/screens/Analytics.jsx
git commit -m "feat: permission-gate Analytics — employee gets basic view, admin/supervisor get full

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 26: Wire breadcrumb to live device data

**Files:**
- Modify: `src/components/TopBar.jsx`

**Logic:** The breadcrumb `Bukidnon Corp. > Plant 1 > Grading Line B` is currently hardcoded. Wire it to the active device's `location_path` from `grading.devices`. Since the TopBar doesn't know which device is "current," we accept a `deviceLocation` prop. If not provided, fall back to a generic label, not stale mock data.

- [ ] **Step 1: Update TopBar to accept and display deviceLocation**

```jsx
/**
 * @param {{
 *   variant?: 'default' | 'devices' | 'reports',
 *   connectionState?: string,
 *   deviceLocation?: string | null,
 * }} props
 */
export default function TopBar({ variant = 'default', connectionState, deviceLocation }) {
  const isLive = connectionState === 'connected';

  const breadcrumb = deviceLocation
    ? deviceLocation.replace(/\s*>\s*/g, ' > ')  // Normalize separators
    : 'Bukidnon Fresh Pineapple Corp.';

  return (
    <header className="sticky top-0 z-40 w-full bg-surface/80 backdrop-blur-md border-b border-outline-variant flex justify-between items-center h-16 px-lg ml-60">
      <div className="flex items-center gap-md">
        <div className="flex flex-col">
          <span className="font-label-caps text-label-caps text-on-surface-variant tracking-widest">
            {breadcrumb}
          </span>
        </div>
      </div>
      {/* ... rest unchanged ... */}
    </header>
  );
}
```

- [ ] **Step 2: Update App.jsx to pass deviceLocation to TopBar**

Add a state or derive it from the MQTT context. For now, pass `null` (which shows "Bukidnon Fresh Pineapple Corp." as generic fallback). When device CRUD is wired (Task 9), the active device's `location_path` can be fetched and passed through.

For immediate wiring: we can fetch the first active device's location_path on mount and pass it through. But this requires an API call. For simplicity, I'll add a `deviceLocation` state in App.jsx that fetches from the backend:

```jsx
// In App.jsx, add:
const [deviceLocation, setDeviceLocation] = useState(null);

useEffect(() => {
  if (isAuthenticated) {
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/devices`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.devices?.length > 0) {
          setDeviceLocation(data.devices[0].location_path);
        }
      })
      .catch(() => {});
  }
}, [isAuthenticated]);
```

Pass `deviceLocation` to TopBar.

- [ ] **Step 3: Commit**

```bash
git add src/components/TopBar.jsx src/App.jsx
git commit -m "feat: wire breadcrumb to live device location_path from backend

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 27: Update Sidebar with user info and logout

**Files:**
- Modify: `src/components/Sidebar.jsx`
- Modify: `src/components/SidebarUserCard.jsx`

- [ ] **Step 1: Update SidebarUserCard to accept dynamic user data**

```jsx
export default function SidebarUserCard({
  role,
  station = 'STATION_04',
  avatarUrl,
  onLogout,
}) {
  return (
    <div className="mt-auto pt-lg border-t border-outline-variant">
      <div className="flex items-center gap-md px-sm">
        <img
          className="w-10 h-10 rounded-full border border-primary/20"
          src={avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(role || 'User')}&size=40&background=06b6d4&color=fff`}
          alt={`${role} avatar`}
        />
        <div className="overflow-hidden flex-1">
          <p className="font-label-caps text-label-caps text-primary truncate">
            {role || 'QA LEAD'}
          </p>
          <p className="font-data-mono text-data-mono text-on-surface truncate">
            {station}
          </p>
        </div>
        {onLogout && (
          <button
            onClick={onLogout}
            className="text-on-surface-variant hover:text-error transition-colors"
            title="Sign out"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update Sidebar to use auth context**

```jsx
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ availability }) {
  const { user, logout, isAuthenticated } = useAuth();
  // ... existing nav items ...

  return (
    <aside className="...">
      {/* ... header ... */}
      {/* ... nav ... */}
      <SidebarUserCard
        role={isAuthenticated ? user?.fullName : 'QA LEAD'}
        station={isAuthenticated ? user?.role?.toUpperCase() : 'STATION_04'}
        onLogout={isAuthenticated ? logout : undefined}
      />
    </aside>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.jsx src/components/SidebarUserCard.jsx
git commit -m "feat: wire sidebar user card to auth context with logout button

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 7: Firmware Changes (BLOCKED — .ino file not in repo)

### Task 28: Document firmware changes

**Status: BLOCKED** — `pineapple_scale_firmware.ino` is not in the repository. These changes are documented for implementation once the file is provided.

**Required changes (from Part 3 of spec):**

1. Add `#define MQTT_TOPIC_COMMAND "pineapple/scale1/command"` 
2. Extract button logic into named functions: `doPowerToggle()`, `doTare()`, `doModeToggle()`, `doManualLogTrigger()`
3. Add `mqttClient.setCallback(mqttCommandCallback)` and `mqttClient.subscribe(MQTT_TOPIC_COMMAND)` in `ensureMqttConnected()`
4. `mqttCommandCallback` parses `{"action": "power"|"tare"|"mode"|"log_trigger"}` and calls the corresponding `do*()` function
5. Button 2 (Reset) repurposed to `doManualLogTrigger()` — **FLAGGED: needs team confirmation**
6. Every command handler calls `publishDeviceState()` after execution
7. Old `ESP.restart()` behavior noted as potentially needed via long-press or admin-only HMI action

- [ ] **Step 1: When .ino file is received, implement above changes**
- [ ] **Step 2: Test firmware with MQTT command topic and physical buttons**
- [ ] **Step 3: Commit firmware changes**

---

## Phase 8: Final Integration + Documentation

### Task 29: Update forge.md with session decisions

**Files:**
- Modify: `forge.md`

- [ ] **Step 1: Append decisions to forge.md Decisions log**

```markdown
- `[2026-08-06]` — **Two-schema, one-database decision confirmed.** `grading` + `auth` schemas
  in a single PostgreSQL instance. Rationale: simpler ops for hackathon context; easy to
  split into separate instances later if needed.
- `[2026-08-06]` — **Reset-button reinterpretation FLAGGED, NOT CONFIRMED.** Implemented as
  manual crate-log trigger (`doManualLogTrigger()`). Old `ESP.restart()` behavior noted for
  potential long-press or admin-only HMI action. Team must confirm before production deploy.
- `[2026-08-06]` — **RBAC table confirmed as spec.** Admin full access, supervisor can
  control HMI + view full analytics, employee gets basic analytics + operations log only.
  All routes enforce permissions server-side via `requirePermission()` middleware.
- `[2026-08-06]` — **OCR/CNN capture window set to 3000ms** (time window during which weight,
  Zone 2 occupancy, and OCR result must all arrive to count as one crate event). Documented
  in `useCrateLogCapture.js`. Adjust based on real pipeline latency.
- `[2026-08-06]` — **Backend architecture: Express.js added.** Supersedes forge.md §6.4
  ("no new backend server"). Rationale: PostgreSQL + auth/RBAC + HMI command proxying
  require a server-side component. Node-RED retained for existing SQLite logging, CSV
  export, and Aedes broker hosting.
- `[2026-08-06]` — **README.md and BUILD_SPEC.md still missing.** All work continues to
  reference forge.md as the authoritative spec and the existing codebase for design tokens.
- `[2026-08-06]` — **Firmware file (`pineapple_scale_firmware.ino`) not in repo.** Part 3
  firmware changes documented but not implemented. Pending team providing the file.
```

- [ ] **Step 2: Commit**

```bash
git add forge.md
git commit -m "docs: update forge.md with session decisions and open flags

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 30: Final build verification

- [ ] **Step 1: Install backend dependencies and run migrations**

```bash
cd backend && npm install && npm run migrate
```

- [ ] **Step 2: Build frontend**

```bash
npm run build
```

Expected: Clean build with no errors.

- [ ] **Step 3: Start both servers**

```bash
# Terminal 1: backend
cd backend && npm run dev

# Terminal 2: frontend
npm run dev
```

- [ ] **Step 4: Verify login flow**

1. Open `http://localhost:5173` → should redirect to `/login`
2. Login with `admin@pineapple-hub.local` / `admin123` → should redirect to LiveGrading
3. Check sidebar shows admin user info
4. Check `/devices` shows HMI panel (admin can see all controls)
5. Check `/analytics` shows full analytics (admin)

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final integration fixes and verification

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| 1: DB + Backend Skeleton | 1–5 | Ready |
| 2: Auth + RBAC | 6–8, 11 | Ready |
| 3: Frontend Auth | 12–17 | Ready |
| 4: HMI Panel | 18–21 | Ready |
| 5: OCR Pipeline Wiring | 22 | Ready |
| 6: Removals + Refinements | 23–27 | Ready |
| 7: Firmware | 28 | **BLOCKED** — missing .ino |
| 8: Final Integration | 29–30 | Ready |

**Open flags for team:**
1. Two-schema vs two-database — proceeding with one instance, two schemas
2. Reset button → manual log trigger — implemented as assumption, needs confirmation
3. Missing `pineapple_scale_firmware.ino` — firmware changes blocked
4. Missing "image 4" for logs schema — schema built from Operations Log table screenshot
