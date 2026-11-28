const express = require('express');
const taskModel = require('../models/task.model');
const createController = require('../controllers/tasks.controller');
const { validId } = require('../validators/tasks.validators');
const { httpError } = require('../utils/httpErrors');

// Mounted after authentication, enabled independently from browser mock storage.
module.exports = function createTaskRouter({
  db = require('../config/db'),
} = {}) {
  const router = express.Router({ mergeParams: true });
  const controller = createController(taskModel(db));
  router.use((req, res, next) => {
    if (!req.user)
      throw httpError(401, 'unauthorized', 'Authentication required.');
    if (!validId(req.params.circleId) || !validId(req.user.id))
      throw httpError(404, 'not_found', 'This care circle is unavailable.');
    next();
  });
  router.param('taskId', (req, res, next, id) => {
    if (!/^[\w:-]{1,200}$/.test(id))
      throw httpError(404, 'not_found', 'This task is unavailable.');
    next();
  });
  router.param('seriesId', (req, res, next, id) => {
    if (!validId(id))
      throw httpError(404, 'not_found', 'This schedule is unavailable.');
    next();
  });
  router.get('/tasks', controller.list);
  router.post('/tasks', controller.create);
  router.patch('/tasks/:taskId', controller.update);
  router.delete('/tasks/:taskId', controller.remove);
  router.post('/task-series/:seriesId/stop', controller.stop);
  return router;
};
