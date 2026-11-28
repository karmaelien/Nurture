const express = require('express');
const model = require('../models/assistance.model');
const controller = require('../controllers/assistance.controller');
// Mount after authentication; each operation checks membership inside its own transaction.
module.exports = ({ db = require('../config/db') } = {}) => {
  const router = express.Router({ mergeParams: true });
  const actions = controller(model(db));
  router.use(actions.access);
  router.get('/assistance-reports', actions.list);
  router.get('/assistance-reports/:reportId', actions.get);
  router.post('/assistance-reports', actions.create);
  router.patch(
    '/assistance-reports/:reportId/notification',
    actions.notification,
  );
  return router;
};
