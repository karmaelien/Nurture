const Member = require('../models/member.model');
const { hasAccess } = require('../utils/permissions');
const { httpError } = require('../utils/httpErrors');

module.exports = (permission) => async (req, res, next) => {
  try {
    const dashboardId = Number(req.params.dashboardId);
    if (!Number.isInteger(dashboardId) || dashboardId < 1) {
      return next(httpError(404, 'NOT_FOUND', 'Dashboard not found.'));
    }

    const membership = await Member.findMembership(dashboardId, req.user.id);
    if (!membership) {
      return next(httpError(404, 'NOT_FOUND', 'Dashboard not found.'));
    }

    if (!hasAccess(membership.role, permission)) {
      return next(httpError(403, 'FORBIDDEN', "You don't have permission to do that."));
    }

    req.dashboardId = dashboardId;
    req.membership = membership;
    next();
  } catch (err) {
    next(err);
  }
};