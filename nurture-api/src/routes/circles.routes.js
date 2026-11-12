const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const requirePermission = require('../middleware/requirePermission');
const circles = require('../controllers/circles.controller');
const members = require('../controllers/members.controller');
const recipients = require('../controllers/recipient.controller');
router.use(authenticate);
router.post('/', circles.create);
router.get('/', circles.list);
router.get('/:circleId', requirePermission('circle:view'), circles.get);

router.get('/:circleId/members', requirePermission('members:view'), members.list);
router.post('/:circleId/members', requirePermission('members:manage'), members.add);
router.delete('/:circleId/members/:userId', requirePermission('members:manage'), members.remove);

router.patch('/:circleId', requirePermission('circle:edit'), circles.update);

router.post('/:circleId/recipients', requirePermission('content:edit'), recipients.add);
router.put('/:circleId/recipients/:recipientId/relationship', requirePermission('circle:view'), recipients.updateRelationship);
module.exports = router;