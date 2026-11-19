const { httpError } = require('../utils/httpErrors');

module.exports = (req, res, next) =>
  req.user.is_admin ? next() : next(httpError(404, 'not_found', 'Not found.'));