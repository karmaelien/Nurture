const User = require('../models/user.model');
const { httpError } = require('../utils/httpErrors');
const { parseId } = require('../utils/ids');

// GET /api/admin/users
exports.listUsers = async (req, res, next) => {
  try {
    const users = await User.findAll();
    res.json({
      users: users.map((u) => ({
        id: String(u.id),
        name: u.username,
        email: u.email,
        createdAt: u.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/users/:userId/sessions/revoke
exports.revokeSessions = async (req, res, next) => {
  try {
    const userId = parseId(req.params.userId);
    if (userId === null) {
      throw httpError(404, 'not_found', 'User not found.');
    }
    await User.revokeAllSessions(userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};