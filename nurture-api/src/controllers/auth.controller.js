const argon = require('argon2');
const db = require('../config/db');
const User = require('../models/user.model');
const Circle = require('../models/circle.model');
const Recipient = require('../models/recipient.model');
const { registerSchema, loginSchema, profileSchema } = require('../validators/auth.validators');
const { httpError } = require('../utils/httpErrors');
const { generateToken, hashToken } = require('../utils/tokens');
const logger = require('../utils/logger')
const { toRecipient } = require('../utils/serializers');
const crypto = require('crypto');

// Checked against when the email doesn't exist, so unknown emails take as long as wrong passwords.
// Protect against timing attacks that could reveal whether an email is registered.
const DUMMY_HASH = argon.hash(crypto.randomBytes(32).toString('hex'));

const toUser = (u) => ({ id: String(u.id), name: u.username, email: u.email, phone: u.phone ?? null, timeZone: u.timezone ?? null, createdAt: u.created_at, updatedAt: u.updated_at });

const startSession = async (userId, conn) => {
  const token = generateToken();
  await User.createSession(userId, hashToken(token), conn);
  return token;
};

const toCircleSummary = async (c, userId) => {
  const recipients = await Recipient.listByCircle(c.id, userId);
  return {
    id: String(c.id),
    name: c.name,
    role: c.role,
    recipients: recipients.map((r) => toRecipient(r)),
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
      // logger.logError('zod issues:', parsed.error.issues);
      throw httpError(400, 'validation_error',
        'Provide a valid email, a username, and a password of at least 12 characters and at most 128 characters.');
    }
    const { email, name, password } = parsed.data;

    // Hash before the transaction so the slow work doesn't hold a database connection.
    const passwordHash = await argon.hash(password);
    const { user, token } = await db.transaction(async (tx) => {
      const user = await User.create({ email, username: name, passwordHash }, tx);
      const token = await startSession(user.id, tx);
      return { user, token };
    });

    res.status(201).json({
      token,
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
    const passwordOk = await argon.verify(row?.password_hash ?? (await DUMMY_HASH), password);
    if (!row || !passwordOk) {
      // Use the dummy hash to prevent timing attacks
      throw httpError(401, 'invalid_credentials', 'Invalid email or password.');
    }

    const circles = await Circle.findByOccupancy(row.id);

    res.json({
      token: await startSession(row.id),
      user: toUser(row),
      circles: await Promise.all(circles.map((c) => toCircleSummary(c, row.id))),
    });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const [scheme, token] = req.headers.authorization?.split(' ') || [];
    if (scheme === 'Bearer' && token) await User.revokeSession(hashToken(token));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// exports.changePassword = async (req, res, next) => {
  // Add a model method that loads the hash for one user and another that sets only the password.
  // Validate the input with zod, using the same 12–128 limits as register:
// };

exports.updateProfile = async (req, res, next) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, 'validation_error', 'Provide a valid name or phone number.');
    }

    const updated = await User.updateProfile(req.user.id, parsed.data);
    res.json({ user: toUser(updated) });  } catch (err) {
    next(err);
  }
};