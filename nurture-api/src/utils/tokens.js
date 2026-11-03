const jwt = require('jsonwebtoken');
const config = require('../config/env');

exports.signAccessToken = (userId) =>
  jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: '5m' });
exports.verifyAccessToken = (token) => {
  const payload = jwt.verify(token, config.jwtSecret);
  return { userId: Number(payload.sub) };
};