const { verifyAccessToken } = require('../utils/tokens');
const User = require('../models/user.model');

const unauthorized = (res, reason) => {
  return res.status(401).json({
    error: { code: 'unauthorized', message: 'Authentication required.' },
  });
};
module.exports = async (req, res, next) => {
  try {
    const [scheme, token] = req.headers.authorization?.split(' ') || [];
    if (scheme !== 'Bearer' || !token) {
        return unauthorized(res, 'Missing or invalid Bearer token');
    }

    let userId;
    try {
        ({userId} = verifyAccessToken(token));
    } catch (err) {
        return unauthorized(res, 'Invalid token');
    }

    const user = await User.findById(userId);
    if (!user) {
        return unauthorized(res, 'User not found');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err); // database errors go to errorHandler instead of hanging the request
  }
};