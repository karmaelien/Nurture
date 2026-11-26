const express = require('express');
const notificationModel = require('../models/medication-notification.model');
const notificationController = require('../controllers/medication-notifications.controller');
const { pushConfig } = require('../services/medication-push');

// Mount after the shared authenticate middleware. Identity comes only from req.user.
module.exports = function notificationRouter({ db = require('../config/db'), config = pushConfig() } = {}) {
  const router = express.Router();
  const controller = notificationController(notificationModel(db), config);
  router.use(controller.access);
  router.get('/config', controller.config);
  router.post('/subscription/status', controller.status);
  router.post('/subscription', controller.save);
  router.delete('/subscription', controller.remove);
  return router;
};
