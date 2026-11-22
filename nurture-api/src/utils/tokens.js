const crypto = require('crypto');

exports.generateToken = () => crypto.randomBytes(32).toString('base64url');
exports.hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');