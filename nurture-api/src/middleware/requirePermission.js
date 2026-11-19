const Member = require('../models/member.model');
const { hasAccess } = require('../utils/permissions');
const { httpError } = require('../utils/httpErrors');
const { parseId } = require('../utils/ids');

module.exports = (permission) => async (req, res, next) => {
  try {
    const circleId = parseId(req.params.circleId);
    if (circleId === null) {
      return next(httpError(404, 'not_found', 'Circle not found.'));
    }

    const membership = await Member.findMembership(circleId, req.user.id);
    if (!membership) {
      return next(httpError(404, 'not_found', 'Circle not found.'));
    }

    if (!hasAccess(membership.role, permission)) {
      return next(httpError(403, 'forbidden', "You don't have permission to do that."));
    }

    req.circleId = circleId;
    req.membership = membership;
    next();
  } catch (err) {
    next(err);
  }
};