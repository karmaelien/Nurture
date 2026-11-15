const express = require('express');
const expenseModel = require('../models/expense.model');
const expenseController = require('../controllers/expenses.controller');

// Mount at /api/circles/:circleId/expenses AFTER the shared authenticate middleware.
// This router never accepts identity from request headers/body; req.user is trusted middleware state.
module.exports = function createExpenseRouter({ db = require('../config/db') } = {}) {
  const router = express.Router({ mergeParams: true });
  const controller = expenseController(expenseModel(db));
  router.use(controller.access);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.patch('/:expenseId', controller.existing, controller.update);
  router.delete('/:expenseId', controller.existing, controller.remove);
  return router;
};
