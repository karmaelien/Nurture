const { hashToken } = require('../utils/tokens');
const User = require('../models/user.model');

const unauthorized = (res) => res.status(401).json({
  error: { code: 'unauthorized', message: 'Your session has ended. Log in again.' },
});

module.exports = async (req, res, next) => {
  try {
    const [scheme, token] = req.headers.authorization?.split(' ') || [];
    if (scheme !== 'Bearer' || !token) return unauthorized(res);

    const user = await User.findBySession(hashToken(token));
    if (!user) return unauthorized(res);
    
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};