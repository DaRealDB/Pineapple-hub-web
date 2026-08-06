# Pineapple Hub — Hardware & Software Specification

> **Version:** 1.0 — 2026-08-06
> **Status:** Draft — firmware section pending `.ino` file receipt
> **Authoritative context:** `forge.md`

---

## 1. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        PLANT FLOOR                               │
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐                 │
│  │ ESP32-P4 │   │ AI Camera│   │ HX711 Load   │                 │
│  │ Firmware │   │ (Zones)  │   │ Cell (Scale) │                 │
│  └────┬─────┘   └────┬─────┘   └──────┬───────┘                 │
│       │              │               │                           │
│       │  MQTT/TCP    │  MQTT/TCP     │  (via ESP32)              │
│       └──────────────┼───────────────┘                           │
│                      │                                           │
└──────────────────────┼───────────────────────────────────────────┘
                       │
              ┌────────┴────────┐
              │   Aedes Broker  │  ← Node-RED (port 1884 TCP, 9001 WS)
              │   Node-RED      │
              └────────┬────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
  ┌────┴────┐   ┌──────┴──────┐   ┌───┴──────────┐
  │ Express │   │ React App   │   │ Python OCR   │
  │ Backend │   │ (Vite)      │   │ Backend      │
  │ :3001   │   │ :5173       │   │ :8000        │
  └────┬────┘   └─────────────┘   └──────────────┘
       │
  ┌────┴────┐
  │PostgreSQL│
  │ :5432    │
  └─────────┘
```

### Component Summary

| Component | Role | Port | Technology |
|-----------|------|------|------------|
| **ESP32-P4** | Scale firmware, load cell reading, button handling, MQTT client | — | Arduino C++ |
| **HX711** | 24-bit ADC for load cell weight measurement | — | SPI interface to ESP32 |
| **AI Camera** | Zone 1/2 occupancy detection (forklift/hand presence) | — | Publishes to MQTT vision topics |
| **Aedes MQTT Broker** | Message bus for all telemetry and commands | 1884 (TCP), 9001 (WS) | Node-RED embedded |
| **Node-RED** | Flow orchestration, seed data, SQLite logging, CSV export | 1880 (HTTP) | Node.js |
| **Express Backend** | Auth/RBAC, device CRUD, crate log API, HMI command proxy | 3001 | Node.js, Express, pg |
| **React Frontend** | Live grading, analytics, operations log, device management, HMI | 5173 (dev) | React 19, Vite 6, Tailwind 3 |
| **Python OCR Backend** | Webcam capture, CNN/OCR pipeline, WebSocket streaming | 8000 | FastAPI, OpenCV, Tesseract |
| **PostgreSQL** | Persistent storage for grading logs, auth, devices | 5432 | PostgreSQL 13+ |

---

## 2. Hardware Components

### 2.1 ESP32-P4 Scale Controller

| Attribute | Value |
|-----------|-------|
| **Microcontroller** | ESP32-P4 |
| **Connectivity** | Wi-Fi 2.4 GHz / Ethernet |
| **Load Cell Interface** | HX711 24-bit ADC |
| **Physical Controls** | 4 buttons (Power, Reset, Tare, Mode) |
| **Display** | LCD (model TBD — referenced via `device_state`) |
| **MQTT Client** | PubSubClient or arduino-mqtt library |
| **MQTT Broker** | Aedes at `192.168.1.10:1884` |
| **Measurement Range** | 0–30 kg (crate scale) |
| **Measurement Unit** | Grams (integer) |

### 2.2 Physical Buttons

| Button | Current Function | Proposed Change (UNCONFIRMED) |
|--------|-----------------|-------------------------------|
| **Button 1 — Power** | Toggle scale power state | Keep as-is |
| **Button 2 — Reset** | `ESP.restart()` | **→ Manual crate log trigger** (`doManualLogTrigger()`). Old restart behavior TBD: may move to long-press or admin-only HMI action. **FLAGGED — needs team confirmation.** |
| **Button 3 — Tare** | Zero/tare the scale | Keep as-is |
| **Button 4 — Mode** | Toggle operating mode | Keep as-is |

### 2.3 AI Camera / Vision System

| Attribute | Value |
|-----------|-------|
| **Purpose** | Zone occupancy detection (NOT fruit grading) |
| **Zone 1** | Monitors the scale platform area — detects hand/forklift presence |
| **Zone 2** | Monitors the crate/bin placement area — detects crate approach |
| **Output** | MQTT topics `pineapple/vision/zone1` and `pineapple/vision/zone2` |
| **Integration** | Consumed by `useMqtt.js` in the React frontend; may move to firmware/edge later |

---

## 3. MQTT Topic Contract

### 3.1 Scale Telemetry

| Topic | Direction | Retained | QoS | Payload | Rate |
|-------|-----------|----------|-----|---------|------|
| `pineapple/scale1/availability` | ESP32 → App | Yes | 1 | `"online"` \| `"offline"` | LWT / on connect |
| `pineapple/scale1/data` | ESP32 → App | No | 1 | JSON (see below) | ~2 Hz |
| `pineapple/scale1/device_state` | ESP32 → App | No | 1 | JSON (see below) | On change |
| `pineapple/scale1/command` | App → ESP32 | No | 1 | `{"action":"power"\|"tare"\|"mode"\|"log_trigger"}` | On user action |

#### `pineapple/scale1/data` Payload

```json
{
  "weight_g": 14200,
  "grade": "Grade 1",
  "status": {
    "hx711_fault": false,
    "eth_or_wifi_issue": false
  },
  "ts": 1722938401234
}
```

| Field | Type | Description |
|-------|------|-------------|
| `weight_g` | `integer` | Total crate mass in grams. **Represents full crate, not individual fruit.** |
| `grade` | `string` | Grade from firmware side. Backend overrides this with `gradeCrate()` when writing to DB. |
| `status.hx711_fault` | `boolean` | Load cell ADC fault — weight is invalid when `true` |
| `status.eth_or_wifi_issue` | `boolean` | Network connectivity problem |
| `ts` | `integer` | Free-running `millis()` counter — livelock detection only, NOT wall-clock time |

#### `pineapple/scale1/device_state` Payload

```json
{
  "power": "on",
  "mode": "auto",
  "tare": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `power` | `"on"` \| `"off"` | Current power state |
| `mode` | `string` | Current operating mode (e.g. `"auto"`, `"manual"`) |
| `tare` | `boolean` | Whether scale is currently tared |

### 3.2 Vision Zones

| Topic | Direction | Retained | QoS | Payload |
|-------|-----------|----------|-----|---------|
| `pineapple/vision/zone1` | Camera → App | No | 1 | `"occupied"` \| `"clear"` |
| `pineapple/vision/zone2` | Camera → App | No | 1 | `"occupied"` \| `"clear"` |

### 3.3 HMI Switches (Legacy / Placeholder)

| Topic Pattern | Direction | Payload |
|---------------|-----------|---------|
| `pineapple/hmi/{switchId}/state` | ESP32 → App | `"on"` \| `"off"` |
| `pineapple/hmi/{switchId}/set` | App → ESP32 | `"on"` \| `"off"` |

> **Note:** The HMI switch panel has been replaced with the real `pineapple/scale1/command` topic. These switch topics are retained for backward compatibility with the placeholder SwitchPanel.

---

## 4. Firmware Specification (ESP32-P4)

> **⚠️ BLOCKED:** `pineapple_scale_firmware.ino` is not in the repository. This section documents the **required** firmware contract. Implementation pending file receipt.

### 4.1 MQTT Connect Sequence

```
1. Connect to Wi-Fi / Ethernet
2. Connect to MQTT broker at 192.168.1.10:1884
3. Publish birth message: pineapple/scale1/availability ← "online" (retained, QoS 1)
4. Set LWT: pineapple/scale1/availability ← "offline" (retained, QoS 1)
5. Subscribe: pineapple/scale1/command (QoS 1)
6. Begin publishing loop:
   - pineapple/scale1/data every ~500ms (weight_g, grade, status, ts)
   - pineapple/scale1/device_state on any state change (power, mode, tare)
```

### 4.2 MQTT Command Handler (Required)

The firmware MUST implement a command subscription callback:

```cpp
void mqttCommandCallback(char* topic, byte* payload, unsigned int length) {
  // Parse JSON: {"action": "power" | "tare" | "mode" | "log_trigger"}
  // Dispatch to corresponding action function
  // Each action function MUST call publishDeviceState() after execution
}
```

### 4.3 Action Functions (Required — Refactored, No Duplication)

Each button's logic MUST be extracted into a named function so both the physical button handler AND the MQTT command callback call the SAME function:

```cpp
void doPowerToggle() {
  // Toggle power state
  // Called by: Button 1 physical press AND MQTT {"action":"power"}
  // MUST call publishDeviceState() after
}

void doTare() {
  // Zero/tare the scale
  // Called by: Button 3 physical press AND MQTT {"action":"tare"}
  // MUST call publishDeviceState() after
}

void doModeToggle() {
  // Toggle operating mode
  // Called by: Button 4 physical press AND MQTT {"action":"mode"}
  // MUST call publishDeviceState() after
}

void doManualLogTrigger() {
  // ⚠️ UNCONFIRMED — proposed replacement for ESP.restart()
  // Trigger a manual crate log entry with capture_trigger = 'manual_button'
  // Publishes an event that the backend captures and writes to grading.crate_logs
  // Called by: Button 2 physical press AND MQTT {"action":"log_trigger"}
  // MUST call publishDeviceState() after
}
```

### 4.4 Device State Publishing (Required)

```cpp
void publishDeviceState() {
  // Publish to: pineapple/scale1/device_state (QoS 1, not retained)
  // Payload: {"power":"on"|"off", "mode":"auto"|"manual", "tare":true|false}
  // MUST be called after EVERY state change — physical button OR MQTT command
}
```

### 4.5 Weight Data Publishing (Required)

```cpp
void publishWeightData() {
  // Publish to: pineapple/scale1/data (QoS 1, not retained)
  // Payload: {"weight_g":<int>, "grade":"<string>", "status":{...}, "ts":<millis()>}
  // Called on a timer (~500ms interval)
  // weight_g: raw HX711 reading converted to grams
  // grade: firmware-side grade string (backend overrides with gradeCrate())
  // status.hx711_fault: true if HX711 reports fault/error
  // status.eth_or_wifi_issue: true if network connectivity is down
  // ts: millis() counter — NOT real time, for livelock detection only
}
```

---

## 5. Zone Gating Logic

### 5.1 Physical Layout

```
┌─────────────────────────────────────────────┐
│                 CONVEYOR                     │
│                                              │
│   ┌──────────┐          ┌──────────┐         │
│   │  ZONE 2  │          │  ZONE 1  │         │
│   │ (Crate)  │  ──────→ │ (Scale)  │         │
│   │ Approach │          │ Platform │         │
│   └──────────┘          └──────────┘         │
│        ↑                     ↑               │
│   Forklift places       Forklift/hand        │
│   crate here →          MUST CLEAR before    │
│   arms capture          weight is valid      │
└─────────────────────────────────────────────┘
```

### 5.2 Capture Sequence

```
1. Forklift enters Zone 2  →  captureArmed = true   (sequence starts)
2. Forklift places crate on scale (inside Zone 1)
3. Zone 1 is occupied      →  weight SUPPRESSED     (reading invalid)
4. Forklift clears Zone 1  →  weight becomes valid  (reading accepted)
5. Weight stabilizes       →  grade computed
6. OCR extracts batch ID   →  crate_log row created
```

### 5.3 Weight Validity Rules

Weight is valid ONLY when ALL of:
- MQTT connected
- Scale availability = `"online"`
- `status.hx711_fault` = `false`
- `status.eth_or_wifi_issue` = `false`
- Zone 1 = `"clear"`

If ANY condition fails → weight is suppressed (treated same as sensor fault).

---

## 6. OCR/CNN Pipeline

### 6.1 Pipeline Components

| Stage | Technology | Description |
|-------|------------|-------------|
| **Webcam Capture** | OpenCV | Captures frames from USB webcam or IP camera |
| **Zone Detection** | CNN / YOLO | Detects hand/forklift presence in Zone 1 and Zone 2 |
| **OCR Text Extraction** | Tesseract / EasyOCR | Reads batch ID text from crate labels |
| **Deduplication** | Similarity check | Prevents duplicate OCR results for the same crate |

### 6.2 WebSocket Contract (Python OCR Backend → React App)

| Message Type | Direction | Payload |
|-------------|-----------|---------|
| `ocr_result` | Server → Client | `{ text, confidence (0–1), created_at, is_duplicate, similarity_score }` |
| `pipeline_status` | Server → Client | `{ fps, processing_time_ms, ocr_count, error_count, uptime_seconds, pipeline_state }` |
| `webcam_frame` | Server → Client | `{ frame_data: "<base64 jpeg>" }` |
| `deduplication_alert` | Server → Client | `{ text, similarity_score }` |

### 6.3 Crate Log Capture Window

- **Window:** 3000ms
- **Debounce:** 500ms (stable reading)
- **Conditions ALL required:**
  1. Valid weight (Zone 1 clear, no sensor faults)
  2. Zone 2 occupied (capture armed)
  3. OCR result received (text and/or confidence)
- **OCR failure handling:** If OCR produces no text or very low confidence, STILL create the log entry with `ocr_extracted_id = NULL`. A crate that weighed and triggered zones but couldn't be identified is a real event that needs human audit resolution.

---

## 7. Backend API Specification

### 7.1 Base URL

```
http://localhost:3001/api
```

### 7.2 Authentication

All endpoints except `/api/auth/login` require `Authorization: Bearer <jwt>` header.

#### POST /api/auth/login

```
Body:    { "email": "admin@pineapple-hub.local", "password": "admin123" }
Returns: { "token": "<jwt>", "user": { "id", "email", "fullName", "role" } }
Errors:  400 (missing fields), 401 (invalid credentials), 403 (deactivated)
```

#### POST /api/auth/logout

```
Headers: Authorization: Bearer <token>
Returns: { "ok": true }
Note:   Revokes the session server-side
```

#### GET /api/auth/me

```
Headers: Authorization: Bearer <token>
Returns: { "user": { "id", "email", "fullName", "role", "lastLoginAt", "permissions": [...] } }
```

### 7.3 Devices

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/api/devices` | (any auth) | List all devices |
| `POST` | `/api/devices` | `devices.manage` | Create device |
| `PUT` | `/api/devices/:id` | `devices.manage` | Update device |
| `DELETE` | `/api/devices/:id` | `devices.manage` | Delete device |

#### Device Object

```json
{
  "id": "uuid",
  "device_id": "scale1",
  "label": "Scale 04",
  "location_path": "Bukidnon Corp. > Plant 1 > Grading Line B",
  "mqtt_topic_prefix": "pineapple/scale1",
  "is_active": true,
  "created_at": "2026-08-06T10:00:00Z",
  "updated_at": "2026-08-06T10:00:00Z"
}
```

### 7.4 Crate Logs

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/api/crate-logs` | `operations_log.view` | Query logs with filters |
| `POST` | `/api/crate-logs` | (any auth, auto_zone) or `hmi.log_trigger` (manual_button) | Create log entry |

#### GET Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `device_id` | `string` | Filter by device (exact match) |
| `batch_id` | `string` | Filter by batch (ILIKE substring) |
| `from` | `ISO 8601` | Start of date range |
| `to` | `ISO 8601` | End of date range |
| `limit` | `int` | Page size (default: 50) |
| `offset` | `int` | Page offset (default: 0) |

#### POST Body

```json
{
  "device_id": "scale1",
  "batch_id": "PN-2024-B102",
  "crate_weight_g": 14200,
  "grade": "grade_1",
  "zone1_status": "clear",
  "zone2_status": "occupied",
  "ocr_extracted_id": "PN-2024-B102",
  "ocr_confidence": 95.50,
  "capture_trigger": "auto_zone",
  "captured_at": "2026-08-06T10:00:00Z"
}
```

### 7.5 HMI Commands

#### POST /api/hmi/command

```
Body:    { "device_id": "scale1", "action": "power" | "tare" | "mode" | "log_trigger" }
Returns: { "ok": true, "command_id": "uuid", "device_id": "scale1", "action": "power", "status": "pending" }
Errors:  400 (invalid/missing fields), 403 (insufficient permissions), 404 (device not found), 503 (MQTT broker down)
```

| Action | Required Permission |
|--------|-------------------|
| `power` | `hmi.control` |
| `tare` | `hmi.control` |
| `mode` | `hmi.control` |
| `log_trigger` | `hmi.log_trigger` |

---

## 8. Database Schema

### 8.1 Database

- **Instance:** Single PostgreSQL database `pineapple_hub`
- **Version:** PostgreSQL 13+ (required for `gen_random_uuid()`)
- **Schemas:** `grading` (operational) + `auth` (identity)

### 8.2 grading Schema

#### grading.devices

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `device_id` | `TEXT` | UNIQUE NOT NULL |
| `label` | `TEXT` | NOT NULL |
| `location_path` | `TEXT` | NOT NULL |
| `mqtt_topic_prefix` | `TEXT` | NOT NULL |
| `is_active` | `BOOLEAN` | DEFAULT true |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() |
| `updated_at` | `TIMESTAMPTZ` | DEFAULT now() |

#### grading.crate_logs

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `UUID` | PK |
| `device_id` | `UUID` | FK → grading.devices(id) |
| `batch_id` | `TEXT` | nullable |
| `crate_weight_g` | `INTEGER` | NOT NULL |
| `grade` | `TEXT` | CHECK: light, grade_1, heavy, invalid, PENDING_FORMULA |
| `zone1_status_at_capture` | `TEXT` | CHECK: clear, occupied, unknown |
| `zone2_status_at_capture` | `TEXT` | CHECK: clear, occupied, unknown |
| `ocr_extracted_id` | `TEXT` | nullable — NULL when OCR fails |
| `ocr_confidence` | `NUMERIC(5,2)` | 0.00–100.00 |
| `capture_trigger` | `TEXT` | CHECK: auto_zone, manual_button |
| `audit_status` | `TEXT` | DEFAULT 'pending', CHECK: pending, confirmed, flagged |
| `captured_at` | `TIMESTAMPTZ` | NOT NULL |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() |

**Indexes:**
- `idx_crate_logs_device_time` — `(device_id, captured_at DESC)`
- `idx_crate_logs_batch` — `(batch_id)`

#### grading.hmi_command_log

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `UUID` | PK |
| `device_id` | `UUID` | FK → grading.devices(id) |
| `user_id` | `UUID` | NOT NULL (app-layer FK to auth.users) |
| `action` | `TEXT` | CHECK: power, tare, mode, log_trigger |
| `requested_at` | `TIMESTAMPTZ` | DEFAULT now() |
| `acknowledged_at` | `TIMESTAMPTZ` | nullable — set on device_state confirmation |
| `status` | `TEXT` | DEFAULT 'pending', CHECK: pending, acknowledged, timed_out |

### 8.3 auth Schema

#### auth.roles

| Column | Type |
|--------|------|
| `id` | `UUID` PK |
| `name` | `TEXT UNIQUE` — admin, supervisor, employee |
| `hierarchy_level` | `INTEGER` — 0=admin, 1=supervisor, 2=employee |

#### auth.permissions

| Column | Type |
|--------|------|
| `id` | `UUID` PK |
| `key` | `TEXT UNIQUE` |

**Seed values:** `hmi.control`, `hmi.log_trigger`, `devices.manage`, `analytics.view_full`, `analytics.view_basic`, `operations_log.view`, `users.manage`

#### auth.role_permissions

| Column | Type |
|--------|------|
| `role_id` | `UUID` FK → auth.roles(id) CASCADE |
| `permission_id` | `UUID` FK → auth.permissions(id) CASCADE |
| | `PRIMARY KEY (role_id, permission_id)` |

#### auth.users

| Column | Type |
|--------|------|
| `id` | `UUID` PK |
| `email` | `TEXT UNIQUE NOT NULL` |
| `password_hash` | `TEXT NOT NULL` — bcrypt, cost 10 |
| `full_name` | `TEXT NOT NULL` |
| `role_id` | `UUID` FK → auth.roles(id) |
| `is_active` | `BOOLEAN DEFAULT true` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` |
| `last_login_at` | `TIMESTAMPTZ` |

#### auth.sessions

| Column | Type |
|--------|------|
| `id` | `UUID` PK |
| `user_id` | `UUID` FK → auth.users(id) CASCADE |
| `issued_at` | `TIMESTAMPTZ DEFAULT now()` |
| `expires_at` | `TIMESTAMPTZ NOT NULL` |
| `revoked_at` | `TIMESTAMPTZ` — set on logout |

---

## 9. Role-Based Access Control (RBAC)

### 9.1 Role Hierarchy

| Role | Level | HMI Control | Log Trigger | Device CRUD | Full Analytics | Basic Analytics | Ops Log | User Mgmt |
|------|-------|:-----------:|:-----------:|:-----------:|:--------------:|:---------------:|:-------:|:---------:|
| **admin** | 0 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **supervisor** | 1 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| **employee** | 2 | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |

### 9.2 Enforcement

- **Server-side:** All API routes check permissions via `requirePermission()` middleware. An employee account CANNOT hit HMI command endpoints — they receive HTTP 403.
- **Client-side:** UI elements are hidden based on permissions (via `useAuth().hasPermission()`), but this is cosmetic only — the real enforcement is server-side.
- **Analytics:** One component tree, permission-gated. Employee sees only Avg Crate Weight chart. Admin/supervisor see all 4 charts + export controls.

---

## 10. Frontend Architecture

### 10.1 Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 |
| Build | Vite 6 |
| Styling | Tailwind CSS 3 (Material Design 3 dark theme) |
| Routing | React Router 7 |
| Charts | Recharts 2 |
| MQTT Client | mqtt.js 5 (browser WebSocket) |
| State | React hooks (useMqtt, useWebSocket, useAuth, useApi) |

### 10.2 Screens

| Route | Screen | Auth Required | Permission |
|-------|--------|:-------------:|------------|
| `/login` | LoginPage | No | — |
| `/` | LiveGrading | Yes | — |
| `/operations-log` | OperationsLog | Yes | `operations_log.view` |
| `/analytics` | Analytics | Yes | `analytics.view_basic` |
| `/devices` | DeviceManagement | Yes | — |
| `/reports` | Reports | Yes | — |
| `/ocr-pipeline` | OCRPipeline | Yes | — |

### 10.3 Shared Components

| Component | Purpose |
|-----------|---------|
| `Sidebar` | Fixed 240px navigation, user card, scale status indicator |
| `TopBar` | Sticky header, breadcrumb (live from device location_path), MQTT status |
| `StatusPill` | Reusable status indicator (online/offline/pending/flagged/occupied/clear/armed/seed) |
| `MetricCard` | Icon + label + value display |
| `DataTable` | Generic sortable data table |
| `HMIPanel` | RBAC-gated device controls (Power, Tare, Mode, Log Trigger) with pending/timeout |
| `ProtectedRoute` | Auth + permission route guard |
| `LoginPage` | Email/password authentication form |
| `WebcamFeed` | Live webcam frame display (base64 JPEG over WebSocket) |
| `OCRResults` | Real-time OCR result list |
| `PipelineStatus` | OCR pipeline health metrics |

### 10.4 Hooks

| Hook | Purpose |
|------|---------|
| `useMqtt` | MQTT connection, telemetry subscription, command publishing, zone/device state |
| `useWebSocket` | OCR pipeline WebSocket (ocr_result, pipeline_status, webcam_frame) |
| `useAuth` | Auth context consumer (login, logout, permissions, role checks) |
| `useApi` | Authenticated fetch wrapper (JWT Bearer token) |
| `useCrateLogCapture` | Watches MQTT + OCR conditions, creates crate_log rows via API |

### 10.5 Design Tokens

All from `tailwind.config.js` — Material Design 3 dark theme:

| Token | Value | Usage |
|-------|-------|-------|
| `background` | `#0b1326` | Page background |
| `surface-container` | `#171f33` | Cards, panels |
| `primary` | `#4cd7f6` | Accent color, interactive elements |
| `on-surface` | `#dae2fd` | Primary text |
| `outline-variant` | `#3d494c` | Borders |
| `tertiary` | `#ffb873` | Warnings, seed data indicator |
| `error` | `#ffb4ab` | Fault states |
| Font | `Hanken Grotesk` | Headlines, body |
| Mono | `JetBrains Mono` | Data values, tabular numbers |

---

## 11. Network Architecture

### 11.1 Port Map

| Port | Service | Protocol |
|------|---------|----------|
| 1884 | Aedes MQTT Broker (TCP) | MQTT |
| 9001 | Aedes MQTT Broker (WebSocket) | MQTT/WS |
| 1880 | Node-RED Admin + HTTP API | HTTP |
| 3001 | Express Backend API | HTTP |
| 5173 | React Dev Server (Vite) | HTTP |
| 8000 | Python OCR Backend | HTTP/WS |
| 5432 | PostgreSQL | TCP |

### 11.2 Default IPs

| Host | IP | Notes |
|------|-----|-------|
| MQTT Broker / Node-RED | `192.168.1.10` | Aedes + flows |
| PostgreSQL | `localhost:5432` | Local dev; production would use a managed instance |

---

## 12. Environment Variables

### 12.1 Backend (`backend/.env`)

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pineapple_hub
JWT_SECRET=change-me-to-a-random-string-at-least-32-chars
JWT_EXPIRES_IN=24h
MQTT_BROKER_URL=mqtt://192.168.1.10:1883
PORT=3001
```

### 12.2 Frontend (`.env`)

```bash
VITE_MQTT_WS_URL=ws://192.168.1.10:9001
VITE_API_URL=http://localhost:3001
VITE_NODE_RED_BASE_URL=http://192.168.1.10:1880
VITE_OCR_API_URL=http://localhost:8000
VITE_OCR_WS_URL=ws://localhost:8000
```

---

## 13. Crate Grading Formula

> **⚠️ OPEN — PENDING CLIENT CONFIRMATION**

The grading formula is a **swappable pure function** in `src/utils/formatters.js`:

```js
export function gradeCrate(weightGrams, itemCount) {
  // PLACEHOLDER — returns 'PENDING_FORMULA' for all valid weights
  // Replace with confirmed formula once specified by client
  // Input: total crate weight in grams, optional item count
  return 'PENDING_FORMULA';
}
```

The old per-pineapple thresholds (`<1200g` Light / `1200–1500g` Grade 1 / `>1500g` Heavy) are **deprecated** and must NOT be applied to crate weights.

---

## 14. Open Items & Flags

| # | Item | Status | Owner |
|---|------|--------|-------|
| 1 | **Crate grading formula** — `PENDING_FORMULA` placeholder active | ⚠️ Waiting on client | Client/Judge |
| 2 | **Reset button → log trigger** — assumption, not confirmed | ⚠️ Flagged | Team |
| 3 | **Firmware `.ino` file** — not in repo, changes blocked | ⛔ Blocked | Team |
| 4 | **Missing "image 4"** — schema built from Operations Log screenshot | ⚠️ Flagged | Team |
| 5 | **Vision zone topic names** — placeholder contract, confirm with hardware team | ⚠️ Flagged | Hardware team |
| 6 | **Zone 1 gating location** — currently in browser, should move to edge? | ℹ️ Noted | Architecture |
| 7 | **Physical switch list** — placeholder in `switchConfig.js`, needs real config | ⚠️ Flagged | Hardware team |
| 8 | **Two-schema vs two-database** — proceeding with one instance | ✅ Decided | — |
| 9 | **README.md / BUILD_SPEC.md** — confirmed missing from repo | ℹ️ Noted | — |
