# forge.md — Pineapple Hub Agent Context

> **Read this file in full before touching any code.** This is the live working-context file for
> any Claude Code / DeepSeek V4 Pro session on this repo. `README.md` and `BUILD_SPEC.md` are
> still canonical for the original design system and firmware baseline — this file documents
> **what has changed since those were written** and must be treated as authoritative wherever it
> conflicts with them. Update this file's "Decisions log" and "Open questions" sections yourself
> as you make choices, so the next session doesn't re-litigate them.

---

## 1. Status: mock-data regression

The web app currently generates **mock data and presents it as if live** on at least the Live
Grading screen (weight jitter, gauge animation, batch log, hardware status). This violates the
client's non-negotiable #1 requirement in `README.md` ("no static/cached/mock values ever
presented as real"). Before adding any new feature below, **audit the entire codebase for every
place mock data is being rendered without a clear "seed/demo — not live" indicator**, and fix
those first. Do not just add new features on top of a dashboard that's still lying about being
live — that regression is priority zero.

Scan for: `setInterval` jitter loops, hardcoded arrays in `data/mockData.js` being rendered
directly by screens instead of by `useMqtt.js` state, any component that doesn't check
`connectionState`/`hx711_fault`/`eth_or_wifi_issue` before rendering a weight/grade/status value.

---

## 2. Objective change: crate/bin weighing, not individual pineapples

**Superseded decision (was in README.md):** the scale measured individual pineapples one at a
time, with per-pineapple grading (`<1200g` Light / `1200–1500g` Grade 1 / `>1500g` Heavy).

**New decision (hackathon judge feedback):** the scale now weighs a **bin/crate containing
multiple pineapples**, placed on the scale as a single load. Consequences to work through
codebase-wide, not just in one component:

- Every UI label referring to a single pineapple's weight must become crate/bin language.
  Example: BUILD_SPEC.md's `"CURRENT LOAD WEIGHT"` label and `1.42 kg` scale stay conceptually
  the same widget, but the value now represents `crate_weight_g`, and copy should say something
  like **"CURRENT CRATE WEIGHT"** — grep the whole frontend for "pineapple" used as the subject
  of a per-item weight/grade string and correct it in context; don't do a blind find/replace,
  since some "pineapple" references (product name, corp name, branding) are correct as-is.
- **The old per-item grading thresholds (Light/Grade 1/Heavy in the 1.0–2.0kg range) no longer
  apply directly to a crate's total weight**, since a crate of many pineapples will weigh many
  kilograms. Do not silently keep applying the old thresholds to the new crate weight — that
  would misgrade every reading.
  - **This is an open item, not yet specified by the client/judge — see Open Questions below.**
    Until confirmed, implement grading as a clearly swappable pure function
    (`gradeCrate(weightGrams, itemCount?)` in `utils/formatters.js`) so the actual formula can be
    dropped in without touching UI code. Do not hardcode a guessed threshold into the UI.
- `weight_g` in the MQTT `pineapple/scale1/data` payload now represents the crate's total mass.
  If item count per crate becomes available later (e.g. from the AI camera or manual entry),
  design the data shape so `item_count` and `avg_item_weight_g` are optional fields that degrade
  gracefully to `undefined`/hidden UI when absent — don't require them.

---

## 3. New subsystem: AI camera, two-zone gating

**This supersedes README.md's "Explicitly out of scope right now: camera/YOLO vision grading"
decision.** Camera-based zone detection is now in scope for the hackathon demo (not for grading
itself — for gating when the scale is allowed to report data). Log this reversal in the Decisions
log section below once implemented.

**Zone 1 — at the weigh scale.** While a hand/forklift is detected inside Zone 1, the scale's
weight reading must be treated as **invalid/suppressed**, not just visually deprioritized. The
physical reason: a hand/forklift resting in or over the scale area contaminates the reading. Only
once Zone 1 is clear does the scale's `weight_g` become eligible for display as a valid reading.

**Zone 2 — at the bin/crate.** A hand/forklift must be present in Zone 2 to **start** the crate
data-capture process. Read this as a trigger/arm signal, not a continuous gate — presence in
Zone 2 begins a capture sequence; the actual accepted weight value still depends on Zone 1 being
clear per the rule above.

**Sequencing implied by the two rules together (confirm with hardware team, but this is the only
consistent reading of the two constraints as given):**
1. Forklift/hand enters Zone 2 → capture sequence arms/starts.
2. Forklift/hand places the crate and — critically — must clear out of Zone 1 (the scale area
   itself) for the reading to be considered valid.
3. Only when Zone 1 is clear does the app accept `weight_g` from `pineapple/scale1/data` as a
   real, displayable reading. While Zone 1 is occupied, treat weight the same way the app already
   treats `hx711_fault: true` — blank/invalid, not stale-but-shown.

**Data contract (propose, confirm with hardware/vision team before firmware/vision-side changes):**
Follow the existing MQTT topic-naming convention in README.md (`pineapple/scale1/...`). Proposed
new topics — treat these as the app-side contract to build against; do not invent camera/vision
code yourself, only consume these topics:

| Topic | Retained | QoS | Payload | Meaning |
|---|---|---|---|---|
| `pineapple/vision/zone1` | No | 1 | `"occupied"` \| `"clear"` | Hand/forklift presence at the scale |
| `pineapple/vision/zone2` | No | 1 | `"occupied"` \| `"clear"` | Hand/forklift presence at the bin/crate |

If the actual camera integration publishes under different topic names or a combined JSON
payload, treat the table above as a placeholder contract and isolate all zone-topic references
behind a single constants file (`src/constants/mqttTopics.js`) so remapping is a one-line change,
not a codebase-wide edit.

**Where the gating logic should live:** implement it in the web app for now (in `useMqtt.js` or a
dedicated `useZoneGatedWeight.js` hook), since that's the layer currently being built and the
firmware/Node-RED side is out of this task's scope. Leave a clear extension path noted in code
comments for moving this logic into firmware or Node-RED later if the team decides the gating
should be enforced at the edge instead of the browser.

**UI requirement:** Live Grading screen must show Zone 1 / Zone 2 occupancy state visibly (e.g.
two small status indicators near the weight KPI), using the existing `StatusPill`/dot-indicator
patterns from BUILD_SPEC.md rather than inventing a new visual language. When Zone 1 is occupied,
the weight display should visibly read as suppressed/invalid, consistent with how `hx711_fault`
is already handled — reuse that same state path rather than building a parallel one.

---

## 4. New subsystem: physical switch HMI, digitally mirrored

The hardware now has physical switches assigned to specific functions. The web app needs a
**Switch Panel** that mirrors and controls these digitally — i.e. bidirectional: the app must
both **reflect the physical switch state** and **allow sending a command that changes it**
(standard HMI pattern).

**This is genuinely underspecified** — neither README.md nor BUILD_SPEC.md documents which
switches exist or what they do. Do not guess specific switch functions or invent business logic
for them. Instead:

- Build a **generic, data-driven Switch Panel component** that renders from a config array:
  ```js
  // src/data/switchConfig.js
  export const switches = [
    { id: "switch_1", label: "PLACEHOLDER — confirm with hardware team", topic: "pineapple/hmi/switch1" },
    // add one entry per physical switch once confirmed
  ];
  ```
- MQTT contract (proposed, same rationale as the camera topics — isolate behind
  `src/constants/mqttTopics.js`):

  | Topic pattern | Direction | Payload | Meaning |
  |---|---|---|---|
  | `pineapple/hmi/{switchId}/state` | Firmware → App | `"on"` \| `"off"` | Current physical state |
  | `pineapple/hmi/{switchId}/set` | App → Firmware | `"on"` \| `"off"` | Commanded state |

- Each switch in the panel: label, live state pill (reuse `StatusPill`), and a toggle control
  that publishes to the `/set` topic. Optimistic UI is not appropriate here (this is physical
  hardware, not a settings toggle) — show a pending/transitional state until the `/state` topic
  confirms the change, and time out to an error state if no confirmation arrives within a few
  seconds.
- Where should this live? Device Management (`/devices`) already has a hardware-focused table
  per BUILD_SPEC.md — add the Switch Panel there as a new card, following the existing card
  structure (`surface-container`, border `outline-variant`, `rounded`, `p-lg`) rather than
  inventing new visual chrome.

---

## 5. Codebase hygiene mandate

The person building this explicitly wants **no redundant or repeated code, frontend or backend**.
Before and while making the above changes:

- Grep for repeated inline Tailwind class strings that should be extracted into the shared
  `StatusPill` / `MetricCard` / `DataTable` components — if you find a screen hand-rolling a pill
  or table instead of using the shared component, consolidate it.
- Grep for repeated MQTT topic string literals — every topic string must come from
  `src/constants/mqttTopics.js`, not be retyped per component.
- Grep for duplicated grading/formatting logic — anything computing a grade, formatting a weight,
  or mapping dBm-to-bars must live once in `utils/formatters.js` and be imported, not
  reimplemented per screen.
- Consolidate zone/switch/weight-validity state derivation into hooks (`useMqtt.js` and any new
  hooks) rather than letting individual screen components each re-derive "is this reading valid"
  logic independently — one source of truth, many consumers.
- Remove any now-dead mock-generation code paths once real MQTT wiring replaces them, rather than
  leaving both live and mock code paths active side by side "just in case."

---

## 6. Non-negotiables carried forward from README.md (still apply, unchanged)

1. Live, accurate data only — no mock value ever shown as if real.
2. Honest failure state — offline/invalid must be visually unambiguous, never a frozen "live"
   number.
3. Reliability over feature richness — get the above solid before polishing anything cosmetic.
4. No new backend server — Node-RED (SQLite logging, CSV export, Aedes broker hosting) is
   retained; the React app stays a pure frontend over MQTT + existing Node-RED HTTP endpoints.

---

## 7. Open questions (do not silently resolve these — implement swappable defaults and flag them)

- What is the actual crate/bin grading formula, now that weight reflects multiple pineapples?
  → `gradeCrate()` in `src/utils/formatters.js` returns `'PENDING_FORMULA'` as a placeholder.
- Exact camera → MQTT topic names/payload shape for Zone 1 / Zone 2 (proposed contract above is a
  placeholder). → Isolated behind `src/constants/mqttTopics.js` — `TOPIC_VISION_ZONE1` and
  `TOPIC_VISION_ZONE2`.
- Full list and function of the physical switches (proposed generic panel above needs real
  config). → Placeholder config in `src/data/switchConfig.js`; SwitchPanel reads it generically.
- Does Zone 1 gating belong in firmware/vision-edge logic instead of the browser long-term?
  → Currently in `useMqtt.js`'s `dataValid` derivation; extension path noted in code comments.

---

## 8. Decisions log (append here as you make choices during this session)

- `[DATE]` — camera/vision zone-gating reintroduced into scope, superseding README.md's earlier
  "explicitly out of scope" call, per hackathon judge feedback. Reason: required for the crate
  demo, not for grading itself.
- `[2026-08-04]` — **Mock-data regression fixed codebase-wide.** Added `StatusPill variant="seed"`
  (tertiary-colored pill with "SEED DATA" label) as the standard seed-data indicator. Applied to:
  LiveGrading (weight KPI, grade, gauge, throughput, batch log, environment), OperationsLog
  (pagination footer), Analytics (header + donut chart), DeviceManagement (3 diagnostic cards),
  Reports (export history header). Seed-weight jitter loop now runs at crate-scale (~14.2 kg).
- `[2026-08-04]` — **Crate/bin rescoping implemented.** All UI labels changed from
  per-pineapple to crate language ("CURRENT CRATE WEIGHT", "CRATE WEIGHT RANGE", "Crates
  Processed", "CRATE LOG", "Avg Crate Weight Stability Trend", "Crate Weight (kg)"). Seed data
  weights rescaled from ~1.4 kg to ~14 kg. `gradeCrate()` placeholder function created in
  `utils/formatters.js`; legacy `classifyWeight()` deprecated with clear comments. Gauge range
  extended to 0–30 kg placeholder.
- `[2026-08-04]` — **Zone gating implemented in `useMqtt.js`.** Zone 1 occupancy folded into the
  existing `dataValid` derivation (same path as `hx711_fault` — weight treated as invalid while
  occupied). Zone 2 occupancy exposed as `captureArmed`. Zone indicators added to LiveGrading
  using existing `StatusPill` dot variants (`occupied`/`clear`/`armed`). Zone 1 suppression shows
  strikethrough weight + "WEIGHT SUPPRESSED" pill, reusing the fault-state UI pattern.
- `[2026-08-04]` — **Switch HMI panel implemented.** `src/components/SwitchPanel.jsx` renders
  from `src/data/switchConfig.js` config array with pending/timeout state per switch.
  `useMqtt.js` subscribes to `pineapple/hmi/+/state` wildcard and exposes `switchStates` +
  `publishSwitchCommand`. Panel placed on DeviceManagement screen following card shell pattern.
- `[2026-08-04]` — **Codebase hygiene: `src/constants/mqttTopics.js` created** as single source
  for all MQTT topic strings. All topics (scale telemetry, vision zones, HMI switches) imported
  from here; `useMqtt.js` no longer hardcodes any topic literals. `hmiStateTopic()` and
  `hmiSetTopic()` builder functions for switch topic patterns.
- `[2026-08-04]` — **`README.md` and `BUILD_SPEC.md` confirmed missing from repo.** forge.md
  references them but they don't exist on disk. This session's work treated forge.md as the
  authoritative spec and inferred the original design system from the existing codebase (Tailwind
  tokens in `tailwind.config.js`, component patterns in `src/components/`).
- `[2026-08-06]` — **Two-schema, one-database decision confirmed.** `grading` + `auth` schemas
  in a single PostgreSQL instance (`pineapple_hub`). Rationale: simpler ops for hackathon context;
  easy to split into separate instances later if needed. Express backend added at `backend/`
  alongside existing Python OCR backend (separate ports, no collision).
- `[2026-08-06]` — **Reset-button reinterpretation FLAGGED, NOT CONFIRMED.** Firmware changes
  documented in implementation plan but NOT implemented (`pineapple_scale_firmware.ino` not in
  repo). Assumption: Button 2 (ESP.restart()) becomes manual crate-log trigger via
  `doManualLogTrigger()`. Team must confirm before production; old restart behavior may still be
  needed via long-press or admin-only HMI action.
- `[2026-08-06]` — **RBAC table confirmed as spec.** admin full access, supervisor can control
  HMI + view full analytics, employee gets basic analytics + operations log only. All routes
  enforce permissions server-side via `requirePermission()` middleware in Express backend.
  Permission keys: `hmi.control`, `hmi.log_trigger`, `devices.manage`, `analytics.view_full`,
  `analytics.view_basic`, `operations_log.view`, `users.manage`.
- `[2026-08-06]` — **OCR/CNN capture window set to 3000ms** (time window during which weight,
  Zone 2 occupancy, and OCR result must all arrive to count as one crate event). Implemented
  in `useCrateLogCapture.js` hook. OCR failures (no text/low confidence) still create log
  entries with `ocr_extracted_id = NULL` — events are logged, not silently dropped.
- `[2026-08-06]` — **Backend architecture: Express.js added.** Supersedes forge.md §6.4
  ("no new backend server"). Rationale: PostgreSQL + auth/RBAC + HMI command proxying require
  a server-side component. Node-RED retained for existing SQLite logging, CSV export, and Aedes
  broker hosting. Express runs on port 3001 (configurable via `PORT` env var).
- `[2026-08-06]` — **UI removals completed.** Environment card removed from LiveGrading (no
  environmental sensor in scope). Analytics "MQTT OFFLINE" header pill, line status, and ambient
  status removed. Breadcrumb wired to live `grading.devices.location_path` from backend API.
  Analytics permission-gated: employee = basic (Avg Crate Weight only), admin/supervisor = full.
- `[2026-08-06]` — **Placeholder SwitchPanel replaced with real HMIPanel.** New
  `src/components/HMIPanel.jsx` sends commands over `pineapple/scale1/command` MQTT topic
  (Power, Tare, Mode, Log Trigger) with RBAC gating, pending/timeout states, and
  `device_state` confirmation. Old SwitchPanel and switchConfig.js retained for reference.
- `[2026-08-06]` — **Sidebar wired to auth context.** User card shows logged-in user's name
  and role. Logout button added (revokes session server-side). Sidebar "SCALE OFFLINE"
  indicator preserved (separate from removed Analytics pill — confirmed distinction).
- `[2026-08-06]` — **Firmware file (`pineapple_scale_firmware.ino`) not in repo.** Part 3
  firmware changes (command subscription, refactored action functions, Reset→log_trigger
  repurposing) documented in implementation plan but not implemented. Pending team providing
  the file.
- `[2026-08-06]` — **Missing "image 4" for logs schema flagged to team.** Schema built from
  Operations Log table screenshot (Timestamp, Batch ID, Scale ID, Crate Weight, Grade, Audit
  Status, Action columns). If image 4 contained different fields, schema needs adjustment.
