const { httpError } = require('../utils/httpErrors');
const { createSchema, updateSchema, querySchema } = require('../validators/expenses.validators');
const notFound = () => httpError(404, 'not_found', 'Expense, recipient, or care circle not found.');
// Database IDs remain opaque strings on the wire; reject unrepresentable IDs before SQL casts.
const validId = value => /^[1-9]\d*$/.test(String(value)) && Number(value) <= 2147483647;
const parse = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success) throw httpError(400, 'validation_error', 'Provide valid expense fields and date filters.');
  return result.data;
};

module.exports = function expenseController(model) {
  async function recipient(circleId, id) {
    if (!validId(id) || !await model.hasRecipient(circleId, id)) throw notFound();
  }
  return {
    async access(req, res, next) {
      if (!req.user) throw httpError(401, 'unauthorized', 'Authentication required.');
      if (!validId(req.params.circleId) || !validId(req.user.id) || !await model.isMember(req.params.circleId, req.user.id)) throw notFound();
      req.circleId = req.params.circleId;
      next();
    },
    async existing(req, res, next) {
      if (!validId(req.params.expenseId) || !await model.find(req.circleId, req.params.expenseId)) throw notFound();
      next();
    },
    async list(req, res) {
      const query = parse(querySchema, req.query);
      if (query.recipientId) await recipient(req.circleId, query.recipientId);
      res.json({ expenses: await model.list(req.circleId, query) });
    },
    async create(req, res) {
      const body = parse(createSchema, req.body);
      await recipient(req.circleId, body.recipientId);
      res.status(201).json({ expense: await model.create(req.circleId, body) });
    },
    async update(req, res) {
      const body = parse(updateSchema, req.body);
      if (body.recipientId) await recipient(req.circleId, body.recipientId);
      const expense = await model.update(req.circleId, req.params.expenseId, body);
      if (!expense) throw notFound();
      res.json({ expense });
    },
    async remove(req, res) {
      if (!await model.remove(req.circleId, req.params.expenseId)) throw notFound();
      res.status(204).end();
    },
  };
};
