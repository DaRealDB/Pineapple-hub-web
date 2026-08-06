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
export async function roleHasPermission(roleName, permissionKey) {
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
