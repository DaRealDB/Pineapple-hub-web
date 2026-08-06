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
  '$2a$10$2EoTFCT9NvzYedmYPvHKreEpxCkaSynvQBLVWCLM0MIu..lr/BV5a',
  'Admin User',
  (SELECT id FROM auth.roles WHERE name = 'admin'),
  true
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@pineapple-hub.local');

COMMIT;
