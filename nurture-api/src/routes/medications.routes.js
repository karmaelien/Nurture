const express = require('express');
const medicationModel = require('../models/medication.model');
const { httpError } = require('../utils/httpErrors');
const schemas = require('../validators/medications.validators');

function parse(schema, value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw httpError(400, 'validation_error', parsed.error.issues[0].message);
  return parsed.data;
}

// Mount at /api/circles/:circleId AFTER authentication; all membership checks and
// database operations then happen together in the model's PostgreSQL transaction.
module.exports = function createMedicationRouter({ db = require('../config/db') } = {}) {
  const router = express.Router({ mergeParams: true });
  const model = medicationModel(db);
  router.use((req, res, next) => {
    if (!req.user) throw httpError(401, 'unauthorized', 'Authentication required.');
    if (!schemas.validId(req.params.circleId) || !schemas.validId(req.user.id))
      throw httpError(404, 'not_found', 'This care circle is unavailable.');
    next();
  });
  const run = (req, action) => model.run(req.params.circleId, req.user.id, action);
  router.get('/medications', async (req, res) =>
    res.json({
      medications: await run(req, async (model) => {
        parse(schemas.listSchema, req.query);
        return model.list();
      }),
    }),
  );
  router.post('/medications', async (req, res) =>
    res
      .status(201)
      .json({ medication: await run(req, (model) => model.create(parse(schemas.detailsSchema, req.body))) }),
  );
  router.patch('/medications/:medicationId', async (req, res) => {
    if (!schemas.validId(req.params.medicationId))
      throw httpError(404, 'not_found', 'This medication is unavailable.');
    res.json({
      medication: await run(req, (model) =>
        model.update(req.params.medicationId, parse(schemas.updateSchema, req.body)),
      ),
    });
  });
  router.delete('/medications/:medicationId', async (req, res) => {
    if (!schemas.validId(req.params.medicationId))
      throw httpError(404, 'not_found', 'This medication is unavailable.');
    await run(req, (model) =>
      model.remove(req.params.medicationId, parse(schemas.versionSchema, req.body).version),
    );
    res.status(204).end();
  });
  router.get('/medication-occurrences', async (req, res) =>
    res.json({
      medicationOccurrences: await run(req, (model) =>
        model.occurrences(parse(schemas.rangeSchema, req.query)),
      ),
    }),
  );
  router.get('/medication-occurrences/overdue', async (req, res) =>
    res.json({
      medicationOccurrences: await run(req, (model) =>
        model.overdue(parse(schemas.overdueSchema, req.query)),
      ),
    }),
  );
  router.patch('/medication-occurrences/:occurrenceId', async (req, res) => {
    if (req.params.occurrenceId.length > 200) throw httpError(404, 'not_found', 'This dose is unavailable.');
    res.json({
      medicationOccurrence: await run(req, (model) =>
        model.changeStatus(req.params.occurrenceId, parse(schemas.doseStatusSchema, req.body)),
      ),
    });
  });
  return router;
};
