const express = require('express');
const invites = require('../controllers/invites.controller');
const authenticate = require('../middleware/authenticate');

const router = express.Router({ mergeParams: true });

router.post('/api/invites/preview { token }',authenticate,invites.previewCircle());
router.post('/api/invites/accept { token }',authenticate,invites.update());
router.post( '/api/invites/decline { token }',authenticate,invites.remove());