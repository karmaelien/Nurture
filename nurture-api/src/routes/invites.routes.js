const express = require('express');
const invites = require('../controllers/invites.controller');
const authenticate = require('../middleware/authenticate');
const { rateLimit } = require('express-rate-limit');

const inviteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });

const router = express.Router();

router.use(authenticate, inviteLimiter);

router.get('/', invites.list);
router.post('/:circleId/accept', invites.accept);
router.post('/:circleId/decline', invites.decline);

module.exports = router;