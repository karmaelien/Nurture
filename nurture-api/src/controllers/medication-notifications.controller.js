const { httpError } = require('../utils/httpErrors');
const {
  subscriptionSchema,
  endpointSchema,
  parse,
} = require('../validators/medication-notifications.validators');

module.exports = function medicationNotificationController(model, config) {
  return {
    access(req, res, next) {
      if (!req.user) throw httpError(401, 'unauthorized', 'Authentication required.');
      next();
    },
    config(req, res) {
      res.json({ enabled: !!config, publicKey: config?.publicKey ?? null });
    },
    async status(req, res) {
      const { endpoint } = parse(endpointSchema, req.body);
      res.json({ enabled: await model.exists(req.user.id, endpoint) });
    },
    async save(req, res) {
      if (!config)
        throw httpError(503, 'unavailable', 'Medication notifications are not enabled on this server.');
      await model.save(req.user.id, parse(subscriptionSchema, req.body));
      res.status(204).end();
    },
    async remove(req, res) {
      const { endpoint } = parse(endpointSchema, req.body);
      await model.remove(req.user.id, endpoint);
      res.status(204).end();
    },
  };
};
