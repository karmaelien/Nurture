const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const requirePermission = require('../middleware/requirePermission');
const dashboards = require('../controllers/dashboards.controller');
const members = require('../controllers/members.controller');

router.use(authenticate);
router.post('/', dashboards.create);
router.get('/', dashboards.list);
router.get('/:dashboardId', requirePermission('dashboard:view'), dashboards.get);

router.get('/:dashboardId/members', requirePermission('members:view'), members.list);
router.post('/:dashboardId/members', requirePermission('members:manage'), members.add);
router.patch('/:dashboardId/members/:userId', requirePermission('members:manage'), members.updateRole);
router.delete('/:dashboardId/members/:userId', requirePermission('members:manage'), members.remove);

module.exports = router;