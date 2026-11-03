const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const requirePermission = require('../middleware/requirePermission');
const circles = require('../controllers/circles.controller');
const members = require('../controllers/members.controller');

router.use(authenticate);
router.post('/', circles.create);
router.get('/', circles.list);
router.get('/:circleId', requirePermission('circle:view'), circles.get);

router.get('/:circleId/members', requirePermission('members:view'), members.list);
router.post('/:circleId/members', requirePermission('members:manage'), members.add);
router.patch('/:circleId/members/:userId', requirePermission('members:manage'), members.updateRole);
router.delete('/:circleId/members/:userId', requirePermission('members:manage'), members.remove);

module.exports = router;