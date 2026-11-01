const bcrypt = require('bcrypt');
const { z } = require('zod');
const User = require('../models/user.model');
const { signAccessToken } = require('../utils/tokens');

const { registerSchema, loginSchema } = require('../validators/auth.validators');
const { httpError } = require('../utils/httpErrors');
exports.register = async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      console.log('zod issues:', parsed.error.issues);
      throw httpError(400, 'VALIDATION_ERROR',
        'Provide a valid email, a username, and a password of 8 to 72 characters.');
    }
    const { email, username, password } = parsed.data;

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, username, passwordHash });

    res.status(201).json({ user, token: signAccessToken(user.id) });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, 'VALIDATION_ERROR', 'Email and password are required.');
    }
    const { email, password } = parsed.data;

    const row = await User.findByEmail(email);
    const valid = row && (await bcrypt.compare(password, row.password_hash));
    if (!valid) {
      throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const user = { id: row.id, email: row.email, username: row.username };
    res.json({ user, token: signAccessToken(user.id) });
  } catch (err) {
    next(err);
  }
};

exports.logout = (req, res) => {
  res.status(204).end();
};