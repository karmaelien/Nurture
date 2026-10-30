const { verifyToken } = require('../utils/tokens');
const User = require('../models/User');

const unauthorized = (req, res, next) => {
  res.status(401).json({ message: 'Unauthorized' });
};

module.exports = async (req, res, next) => {
    const [scheme, token] = req.headers.authorization?.split(' ') || [];
    if (scheme !== 'Bearer' || !token) {
        return unauthorized(req, res, next);
    }

    let userId;
    try {
        ({userId} = verifyToken(token));
    } catch (err) {
        return unauthorized(req, res, next);
    }

    const user = await User.findById(userId);
    if (!user) {
        return unauthorized(req, res, next);
    }

    req.user = user;
    next();
};