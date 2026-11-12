const User = require('../models/user.model');

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
    await User.revokeAllSessions(Number(req.params.userId));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};