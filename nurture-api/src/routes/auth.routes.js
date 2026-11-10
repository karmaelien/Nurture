const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10 });

router.get('/me', authenticate, controller.me);
router.post('/register', authLimiter, controller.register);
router.post('/login', authLimiter, controller.login);
router.post('/logout', controller.logout);

module.exports = router;