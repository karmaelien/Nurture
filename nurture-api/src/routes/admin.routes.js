const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const admin = require('../controllers/admin.controller');

router.use(authenticate, requireAdmin);
router.get('/users', admin.listUsers);
router.post('/users/:userId/sessions/revoke', admin.revokeSessions);

module.exports = router;