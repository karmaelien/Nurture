const schemas = require('../validators/tasks.validators');
const { httpError } = require('../utils/httpErrors');
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw httpError(400, 'validation_error', result.error.issues[0].message);
  return result.data;
}
module.exports = (model) => {
  const run = (req, action) =>
    model.run(req.params.circleId, req.user.id, action);
  return {
    list: async (req, res) =>
      res.json(
        await run(req, (model) =>
          model.list(parse(schemas.listSchema, req.query)),
        ),
      ),
    create: async (req, res) =>
      res.status(201).json({
        task: await run(req, (model) =>
          model.create(parse(schemas.createSchema, req.body)),
        ),
      }),
    update: async (req, res) =>
      res.json({
        task: await run(req, (model) =>
          model.update(
            req.params.taskId,
            parse(schemas.updateSchema, req.body),
          ),
        ),
      }),
    remove: async (req, res) => {
      await run(req, (model) =>
        model.remove(
          req.params.taskId,
          parse(schemas.versionSchema, req.body).version,
        ),
      );
      res.status(204).end();
    },
    stop: async (req, res) => {
      await run(req, (model) =>
        model.stop(
          req.params.seriesId,
          parse(schemas.versionSchema, req.body).version,
        ),
      );
      res.status(204).end();
    },
  };
};
