const argon = require('argon2');
const { z } = require('zod');
const User = require('../models/user.model');
const Circle = require('../models/circle.model');
const { signAccessToken } = require('../utils/tokens');
const Recipient = require('../models/recipient.model');
const { registerSchema, loginSchema } = require('../validators/auth.validators');
const { httpError } = require('../utils/httpErrors');

const toUser = (u) => ({ id: String(u.id), name: u.username, email: u.email });

const toCircleSummary = async (c, userId) => {
  const recipients = await Recipient.listByCircle(c.id, userId);
  return {
    id: String(c.id),
    name: c.name,
    role: c.role,
    recipients: recipients.map((r) => ({
      id: String(r.id),
      name: r.name,
      relationship: r.relationship,
    })),
  };
};
exports.me = async (req, res, next) => {
  try {
    const circles = await Circle.findByOccupancy(req.user.id);
    res.json({ 
      user: toUser(req.user), 
      circles: await Promise.all(circles.map((c) => toCircleSummary(c, req.user.id)))
    });
  } catch (err) {
    next(err);
  }
};

exports.register = async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      console.log('zod issues:', parsed.error.issues);
      throw httpError(400, 'validation_error',
        'Provide a valid email, a username, and a password of at most 128 characters.');
    }
    const { email, name, password } = parsed.data;

    const passwordHash = await argon.hash(password);
    const user = await User.create({ email, username: name, passwordHash });

    res.status(201).json({
      token: signAccessToken(user.id),
      user: toUser(user),
      circles: [],
    });
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

    const circles = await Circle.findByOccupancy(row.id);

    res.json({
      token: signAccessToken(row.id),
      user: toUser(row),
      circles: circles.map(toCircleSummary),
    });
  } catch (err) {
    next(err);
  }
};

exports.logout = (req, res) => {

  res.status(204).end();
};