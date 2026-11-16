const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');

router.get('/me', authenticate, controller.me);
router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/logout', controller.logout);

module.exports = router;