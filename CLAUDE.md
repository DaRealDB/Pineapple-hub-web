# CLAUDE.md — Pineapple Hub Developer Context

> **Read this first** before touching any code. This file is written for both human developers and AI coding agents. Update the "Recent Changes" section at the end of each significant work session.

---

## What This Is

Pineapple Hub is an IIoT (Industrial Internet of Things) dashboard for a pineapple grading facility. An ESP32-P4 scale weighs crates of pineapples, publishes data over MQTT, and this web app displays live weight readings, manages devices, controls hardware remotely (HMI), runs an OCR pipeline for crate label reading, and persists everything to PostgreSQL.

**Client:** Bukidnon Fresh Pineapple Corp. — CubeWorks IIoT Challenge (Hackathon)

---

## Quick Start (First Time)

```powershell
# 1. Install everything
.\install-all.bat

# 2. Create the database (one-time)
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE pineapple_hub;"

# 3. Configure backend
copy backend\.env.example backend\.env

# 4. Run database migrations
cd backend
npm install
npm run migrate
cd ..

# 5. Start all services
.\start-all.bat
```

Open `http://localhost:5173` → login with `admin@pineapple-hub.local` / `admin123`

---

## Architecture

```
ESP32-P4 (Scale) ──MQTT/TCP──┐
AI Camera (Zones) ──MQTT/TCP──┤
                              ├── Aedes Broker (Node-RED :1884/:9001)
                              │
Python OCR Backend (:8000) ───┤
Express API (:3001) ─── PostgreSQL (:5432)
React Frontend (:5173) ─── MQTT/WS ──┘
```

### Services (start-all.bat launches all 6)

| # | Service | Port | Tech | Purpose |
|---|---------|------|------|---------|
| 1 | MQTT Broker | 1884/9001 | Aedes (Node-RED) | Message bus |
| 2 | Seed Data | — | Node.js | Mock scale data for testing |
| 3 | Node-RED | 1881 | Node-RED | Flow orchestration, SQLite, CSV |
| 4 | Express API | 3001 | Express.js | Auth, RBAC, DB, HMI proxy |
| 5 | OCR Backend | 8000 | Python/FastAPI | Webcam, CNN, Tesseract OCR |
| 6 | React App | 5173 | Vite/React 19 | Dashboard UI |

---

## Key Files & Directories

### Backend (`backend/`)
```
backend/
├── .env.example          # Template — copy to .env and configure
├── package.json           # Express, pg, bcryptjs, jsonwebtoken, mqtt
├── src/
│   ├── index.js           # Express server entry — mounts all routes
│   ├── config.js          # Env vars (DATABASE_URL, JWT_SECRET, etc.)
│   ├── db.js              # PostgreSQL pool + query() helper
│   ├── mqtt.js            # MQTT client — connectMqtt(), publishCommand()
│   ├── middleware/
│   │   ├── auth.js        # JWT Bearer token validation → req.user
│   │   └── rbac.js        # requirePermission('key') middleware factory
│   ├── routes/
│   │   ├── auth.js        # POST /login, /logout, /register, GET /me
│   │   ├── devices.js     # CRUD /api/devices (RBAC: devices.manage)
│   │   ├── crateLogs.js   # GET/POST /api/crate-logs (filtered, paginated)
│   │   └── hmi.js         # POST /api/hmi/command → MQTT publish
│   └── migrations/
│       ├── 001_schemas.sql   # grading + auth schemas (7 tables)
│       ├── 002_seed_roles.sql # Roles, permissions, default admin
│       └── run.js            # Migration runner (idempotent, transactional)
└── main.py                # Python OCR backend (separate FastAPI app)
```

### Frontend (`src/`)
```
src/
├── main.jsx               # Entry — BrowserRouter > AuthProvider > App
├── App.jsx                 # Routes, MQTT context, shell layout
├── context/
│   └── AuthContext.jsx     # AuthProvider — login/logout/permissions/roles
├── components/
│   ├── Sidebar.jsx         # Fixed 240px nav, user card, scale status
│   ├── TopBar.jsx          # Sticky header, breadcrumb (live), MQTT status
│   ├── StatusPill.jsx      # Reusable dot+label (online/offline/pending/...)
│   ├── MetricCard.jsx      # Icon + label + value display
│   ├── DataTable.jsx       # Generic sortable table
│   ├── HMIPanel.jsx        # RBAC-gated device controls (Power/Tare/Mode/Log)
│   ├── LoginPage.jsx       # Email/password login form
│   ├── RegisterPage.jsx    # Self-registration (new users → employee role)
│   ├── ProtectedRoute.jsx  # Auth + permission route guard
│   ├── SwitchPanel.jsx     # Legacy placeholder — replaced by HMIPanel
│   ├── WebcamFeed.jsx      # Live webcam frame (base64 JPEG from WS)
│   ├── OCRResults.jsx      # Real-time OCR result list
│   └── PipelineStatus.jsx  # OCR pipeline health metrics
├── screens/
│   ├── LiveGrading.jsx     # Main dashboard — weight, HMI, camera, zones
│   ├── OperationsLog.jsx   # Historical crate log table
│   ├── Analytics.jsx       # Charts — permission-gated (employee=basic)
│   ├── DeviceManagement.jsx # Device roster + HMI panel
│   ├── Reports.jsx         # Report generator + export history
│   └── OCRPipeline.jsx     # Full OCR pipeline + image upload
├── hooks/
│   ├── useMqtt.js          # MQTT connect, subscribe, publish, state
│   ├── useWebSocket.js     # OCR pipeline WebSocket
│   ├── useApi.js           # Authenticated fetch (JWT Bearer)
│   ├── useAuth.js          # (in AuthContext.jsx — useAuth() hook)
│   └── useCrateLogCapture.js # Watches weight+zones+OCR → POST /api/crate-logs
├── constants/
│   ├── mqttTopics.js       # ALL MQTT topic strings — single source of truth
│   └── permissions.js      # Permission key constants (PERM.HMI_CONTROL, etc.)
├── utils/
│   ├── formatters.js       # gradeCrate(), signalStrength(), formatting
│   └── nodeRedApi.js       # Node-RED HTTP client (CSV export, history)
└── data/
    ├── mockData.js         # Seed data constants (only for dev/testing)
    └── switchConfig.js     # Legacy switch placeholder config
```

### Root Files
```
.env                     # Frontend env vars (VITE_MQTT_WS_URL, VITE_API_URL, etc.)
tailwind.config.js       # Material Design 3 dark theme tokens
forge.md                 # Living project context — supersedes README/BUILD_SPEC
CLAUDE.md                # This file
docs/
  HARDWARE_SOFTWARE_SPEC.md  # Complete system specification
install-all.bat          # One-time dependency installer
start-all.bat            # Launches all 6 services
pineapple_scale_firmware.ino  # ESP32-P4 firmware (Arduino)
```

---

## Environment Variables

### Frontend (`.env`)
```bash
VITE_MQTT_WS_URL=ws://192.168.1.10:9001
VITE_API_URL=http://localhost:3001
VITE_NODE_RED_BASE_URL=http://192.168.1.10:1880
VITE_OCR_API_URL=http://localhost:8000
VITE_OCR_WS_URL=ws://localhost:8000
```

### Backend (`backend/.env`)
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pineapple_hub
JWT_SECRET=change-me-to-a-random-string-at-least-32-chars
JWT_EXPIRES_IN=24h
MQTT_BROKER_URL=mqtt://192.168.1.10:1883
PORT=3001
```

---

## Database

Single PostgreSQL instance, two schemas: `grading` (operational) + `auth` (identity).

### grading schema
- **devices** — IoT scale registry (device_id, label, location_path, mqtt_topic_prefix)
- **crate_logs** — Every crate weighing event (weight, grade, zone state, OCR result, audit status)
- **hmi_command_log** — Audit trail of all HMI commands (who pressed what, when, confirmed?)

### auth schema
- **roles** — admin(0), supervisor(1), employee(2)
- **permissions** — 7 keys: hmi.control, hmi.log_trigger, devices.manage, analytics.view_full, analytics.view_basic, operations_log.view, users.manage
- **role_permissions** — Many-to-many mapping
- **users** — Email, bcrypt password, role FK
- **sessions** — JWT session tracking (issued, expires, revoked)

### RBAC Matrix
| | Admin | Supervisor | Employee |
|---|---|---|---|
| HMI Control (power/tare/mode) | ✅ | ✅ | ❌ |
| Manual Log Trigger | ✅ | ✅ | ❌ |
| Device CRUD | ✅ | ❌ | ❌ |
| Full Analytics (4 charts) | ✅ | ✅ | ❌ |
| Basic Analytics (1 chart) | ✅ | ✅ | ✅ |
| Operations Log | ✅ | ✅ | ✅ |
| User Management | ✅ | ❌ | ❌ |

Server-side enforcement via `requirePermission()` middleware. Client-side hiding via `useAuth().hasPermission()` is cosmetic only.

---

## MQTT Topic Contract

| Topic | Direction | Retained | QoS | Payload |
|-------|-----------|----------|-----|---------|
| `pineapple/scale1/availability` | ESP32→App | Yes | 1 | `"online"`\|`"offline"` |
| `pineapple/scale1/data` | ESP32→App | No | 1 | `{weight_g, grade, status, ts}` |
| `pineapple/scale1/device_state` | ESP32→App | No | 1 | `{power, mode, tare, tare_count, log_trigger_count, ...}` |
| `pineapple/scale1/command` | App→ESP32 | No | 1 | `{"action":"power"\|"tare"\|"mode"\|"log_trigger"}` |
| `pineapple/vision/zone1` | Camera→App | No | 1 | `"occupied"`\|`"clear"` |
| `pineapple/vision/zone2` | Camera→App | No | 1 | `"occupied"`\|`"clear"` |

---

## Key Design Decisions

1. **Crate/bin weighing, not individual fruit** — All UI uses crate language. Old per-pineapple thresholds (1.2–1.5 kg) are deprecated; grading formula is a swappable `gradeCrate()` placeholder returning `PENDING_FORMULA` until client confirms.

2. **Zone gating** — Zone 1 (scale area) occupied → weight suppressed. Zone 2 (crate area) occupied → capture armed. Both conditions + OCR result must align within 3000ms to create a crate_log row.

3. **No mock data shown as live** — When MQTT is offline, the UI shows honest empty/fault states. Seed data exists in Node-RED for testing but is clearly labeled.

4. **Two schemas, one database** — Simpler ops; can split later.

5. **Express backend added** — Supersedes the original "no new backend" rule. Needed for PostgreSQL, auth/RBAC, and HMI command proxying. Node-RED retained for MQTT broker, SQLite logging, CSV export.

6. **No duplicated logic** — Button actions extracted into named functions called by both physical buttons and MQTT commands. One Analytics component tree, permission-gated, not two separate screens.

---

## Recent Changes (2026-08-06 Session)

### Added
- **PostgreSQL backend** — Express API server at `backend/` with 11 source files
- **Auth system** — JWT sessions, 3 roles, 7 permissions, server-side RBAC middleware
- **Login/Register pages** — Email/password auth, self-registration (defaults to employee role)
- **HMIPanel** — Real device controls (Power, Tare, Mode, Log Trigger) on main dashboard, with pending/timeout states, RBAC-gated
- **OCR pipeline wiring** — `useCrateLogCapture.js` hook creates crate_log rows when weight + zones + OCR align
- **Live camera on dashboard** — Webcam feed + OCR results embedded in LiveGrading screen
- **Firmware v2** — `pineapple_scale_firmware.ino` with MQTT command subscription, extracted action functions (doPowerToggle, doTare, doModeToggle, doManualLogTrigger), counter-based state change detection for HMI
- **Startup scripts updated** — `start-all.bat` now launches 6 services including Express backend

### Removed
- **Environment card** (temp/humidity) — no sensor hardware in scope
- **Analytics MQTT OFFLINE pill** under header
- **Analytics bottom status bar** (Line Speed, Ambient)
- **Hardware Status card** from LiveGrading (replaced by HMI panel)

### Changed
- **Breadcrumb** — now live from `grading.devices.location_path` via backend API (was hardcoded)
- **Analytics** — permission-gated: employee sees 1 chart, admin/supervisor see 4
- **Sidebar** — shows logged-in user name/role, logout button
- **DeviceManagement** — placeholder SwitchPanel replaced with real HMIPanel
- **LiveGrading** — HMI controls + camera feed on main dashboard
- **Button 2 (firmware)** — ESP.restart() → manual log trigger (⚠️ UNCONFIRMED — flag to team)

### Open Items
1. Crate grading formula — `gradeCrate()` returns `PENDING_FORMULA` placeholder
2. Reset button → log trigger — implemented but needs team confirmation
3. Vision zone topic names — placeholder contract, confirm with hardware team
4. Physical switch list — placeholder in switchConfig.js
5. Firmware calibration factor — 420.0 is a placeholder
6. I2C LCD address — confirm 0x27 vs 0x3F on-site

---

## Common Issues & Fixes

### "Invalid email or password" even with correct credentials
The seed migration hash may be stale. Run:
```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d pineapple_hub -c "SELECT substring(password_hash, 1, 30) FROM auth.users WHERE email = 'admin@pineapple-hub.local';"
```
If the hash starts with `$2a$10$N9qo...` it's the OLD broken hash. Update it:
```powershell
cd backend
node -e "const{query}=require('./src/db.js'); query(\"UPDATE auth.users SET password_hash = '\$2a\$10\$2EoTFCT9NvzYedmYPvHKreEpxCkaSynvQBLVWCLM0MIu..lr/BV5a' WHERE email = 'admin@pineapple-hub.local'\").then(r => console.log('fixed:', r.rowCount));"
```

### HMI buttons stuck on "PENDING" / timeout
1. Firmware must be v2 (with `mqttCommandCallback` + command subscription)
2. `publishDeviceState()` must be called after every action
3. `device_state` must include `tare_count` and `log_trigger_count` fields
4. Check serial monitor: `[STATE] Published: {...}` should appear after every button press

### `npm run migrate` says "Missing script"
You're in the wrong directory — run from `backend/`, not the project root.

### Build passes but login page is blank
Check that `backend/.env` exists and `DATABASE_URL` is correct. The backend must be running on :3001.

### PowerShell `&&` doesn't work
PowerShell uses `;` instead. Run commands separately or use Git Bash.
