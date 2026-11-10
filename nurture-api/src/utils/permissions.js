const ALL = ['owner', 'member'];

const PERMISSIONS = {
  'circle:view':   ALL,
  'circle:delete': ['owner'],
  'circle:edit':   ['owner'],
  'members:view':     ALL,
  'members:manage':   ['owner'],
  'content:edit':     ['owner', 'member'],
};

exports.hasAccess = (role, permission) =>
  (PERMISSIONS[permission] || []).includes(role);

exports.PERMISSIONS = PERMISSIONS;