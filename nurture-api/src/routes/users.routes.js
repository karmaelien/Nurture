const router = require('express').Router();
const { getMe } = require('../controllers/users.controller');
const authenticate = require('../middleware/authenticate');

router.get('/me', authenticate, getMe);

module.exports = router;