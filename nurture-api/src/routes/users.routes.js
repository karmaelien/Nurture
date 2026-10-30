const router = require('express').Router();
const { createUser, getAllUsers, getUserById, updateUser, deleteUser, getMe } = require('../controllers/users.controller');
const authenticate = require('../middleware/authenticate');

router.post('/', createUser);
router.get('/', getAllUsers);
router.get('/me', authenticate, getMe);
router.get('/:id', getUserById);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;