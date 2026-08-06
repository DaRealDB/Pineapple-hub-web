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
