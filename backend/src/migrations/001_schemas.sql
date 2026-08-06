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
