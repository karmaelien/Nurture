const ALL = ['owner', 'admin', 'member'];

const PERMISSIONS = {
  'dashboard:view':   ALL,
  'dashboard:delete': ['owner'],
  'members:view':     ALL,
  'members:manage':   ['owner', 'admin'],
  'content:edit':     ['owner', 'admin', 'member'],
};

exports.hasAccess = (role, permission) =>
  (PERMISSIONS[permission] || []).includes(role);

exports.PERMISSIONS = PERMISSIONS;