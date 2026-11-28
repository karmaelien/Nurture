const { httpError } = require('../utils/httpErrors');
const schemas = require('../validators/assistance.validators');
const resources = require('../data/assistance-resources.json');
const parse = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw httpError(400, 'validation_error', result.error.issues[0].message);
  return result.data;
};
module.exports = (model) => {
  const run = (req, action) =>
    model.run(req.params.circleId, req.user.id, action);
  return {
    async get(req, res) {
      const { z } = require('zod');
      if (!z.uuid().safeParse(req.params.reportId).success)
        throw httpError(
          404,
          'not_found',
          'This assistance report is unavailable.',
        );
      res.json({
        report: await run(req, (scope) => scope.get(req.params.reportId)),
        resources,
      });
    },
    access(req, res, next) {
      if (!req.user)
        throw httpError(401, 'unauthorized', 'Authentication required.');
      if (
        !schemas.validId(req.user.id) ||
        !schemas.validId(req.params.circleId)
      )
        throw httpError(404, 'not_found', 'This care circle is unavailable.');
      next();
    },
    async list(req, res) {
      res.json({
        ...(await run(req, (scope) =>
          scope.list(parse(schemas.querySchema, req.query)),
        )),
        resources,
      });
    },
    async create(req, res) {
      res
        .status(201)
        .json({
          report: await run(req, (scope) =>
            scope.create(parse(schemas.createSchema, req.body)),
          ),
          resources,
        });
    },
    async notification(req, res) {
      const { z } = require('zod');
      if (!z.uuid().safeParse(req.params.reportId).success)
        throw httpError(
          404,
          'not_found',
          'This assistance report is unavailable.',
        );
      res.json({
        report: await run(req, (scope) =>
          scope.notification(
            req.params.reportId,
            parse(schemas.notificationSchema, req.body),
          ),
        ),
      });
    },
  };
};
