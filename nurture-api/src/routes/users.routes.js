const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');

router.patch('/me', authenticate, controller.updateProfile);

module.exports = router;