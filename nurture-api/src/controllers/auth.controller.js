const argon = require('argon2');
const { z } = require('zod');
const User = require('../models/user.model');
const { signAccessToken } = require('../utils/tokens');

const { registerSchema, loginSchema } = require('../validators/auth.validators');
const { httpError } = require('../utils/httpErrors');

exports.me = async (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email, username: req.user.username } });
}

exports.register = async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      console.log('zod issues:', parsed.error.issues);
      throw httpError(400, 'validation_error',
        'Provide a valid email, a username, and a password of 8 to 72 characters.');
    }
    const { email, username, password } = parsed.data;

    const passwordHash = await argon.hash(password);
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
      throw httpError(400, 'validation_error', 'Email and password are required.');
    }
    const { email, password } = parsed.data;

    const row = await User.findByEmail(email);
    const valid = row && (await argon.verify(row.password_hash, password));
    if (!valid) {
      throw httpError(401, 'invalid_credentials', 'Invalid email or password.');
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