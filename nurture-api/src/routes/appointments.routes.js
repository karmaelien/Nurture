const express = require('express');
const appointmentModel = require('../models/appointment.model');
const { httpError } = require('../utils/httpErrors');
const { validId, querySchema, detailsSchema, statusSchema } = require('../validators/appointments.validators');

const notFound = () => httpError(404, 'not_found', 'Care circle, appointment, recipient, or caregiver not found.');

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw httpError(400, 'validation_error', result.error.issues[0].message);
  return result.data;
}

async function save(write) {
  try {
    const appointment = await write();
    if (!appointment) throw notFound();
    return appointment;
  } catch (error) {
    // Foreign keys enforce circle membership for the recipient and assigned caregiver.
    if (error.code === '23503') throw notFound();
    throw error;
  }
}

// Mount at /api/circles/:circleId/appointments after authentication.
module.exports = function createAppointmentRouter({ db = require('../config/db') } = {}) {
  const router = express.Router({ mergeParams: true });
  const model = appointmentModel(db);

  router.use(async (req, res, next) => {
    if (!req.user) throw httpError(401, 'unauthorized', 'Authentication required.');
    const { circleId } = req.params;
    if (!validId(circleId) || !validId(req.user.id) || !await model.isMember(circleId, req.user.id)) throw notFound();
    next();
  });

  router.get('/', async (req, res) => {
    const { circleId } = req.params;
    const query = parse(querySchema, req.query);
    if (query.recipientId !== undefined &&
      (!validId(query.recipientId) || !await model.hasRecipient(circleId, query.recipientId))) throw notFound();
    res.json({ appointments: await model.list(circleId, query) });
  });

  router.post('/', async (req, res) => {
    const body = parse(detailsSchema, req.body);
    const appointment = await save(() => model.create(req.params.circleId, body));
    res.status(201).json({ appointment });
  });

  router.patch('/:appointmentId', async (req, res) => {
    const { circleId, appointmentId } = req.params;
    if (!validId(appointmentId) || !await model.exists(circleId, appointmentId)) throw notFound();
    const appointment = await save(() => {
      if (req.body && Object.hasOwn(req.body, 'status')) {
        return model.updateStatus(circleId, appointmentId, parse(statusSchema, req.body).status);
      }
      return model.updateDetails(circleId, appointmentId, parse(detailsSchema, req.body));
    });
    res.json({ appointment });
  });

  router.delete('/:appointmentId', async (req, res) => {
    const { circleId, appointmentId } = req.params;
    if (!validId(appointmentId) || !await model.remove(circleId, appointmentId)) throw notFound();
    res.status(204).end();
  });
  return router;
};
