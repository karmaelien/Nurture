const ALL = ['owner', 'admin', 'member'];

const PERMISSIONS = {
  'circle:view':   ALL,
  'circle:delete': ['owner'],
  'circle:edit':   ['owner', 'admin'],
  'members:view':     ALL,
  'members:manage':   ['owner', 'admin'],
  'content:edit':     ['owner', 'admin', 'member'],
};

exports.hasAccess = (role, permission) =>
  (PERMISSIONS[permission] || []).includes(role);

exports.PERMISSIONS = PERMISSIONS;