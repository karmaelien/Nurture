const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const authLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10 });

const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email || ipKeyGenerator(req.ip);
  },
  message: {
    error: {
      code: 'too_many_attempts',
      message: 'Too many login attempts for this account. Try again in 15 minutes.',
    },
  },
  skipSuccessfulRequests: true,
});

router.post('/login', authLimiter, accountLimiter, controller.login);
router.get('/me', authenticate, controller.me);
router.post('/register', authLimiter, controller.register);
router.post('/logout', controller.logout);

module.exports = router;