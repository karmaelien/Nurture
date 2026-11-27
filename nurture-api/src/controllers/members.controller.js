const { z } = require('zod');
const Member = require('../models/member.model');
const User = require('../models/user.model');
const { httpError } = require('../utils/httpErrors');
const { parseId } = require('../utils/ids');
const { addSchema, roleSchema } = require('../validators/members.validators');
const { toMember } = require('../utils/serializers');
const Circle = require('../models/circle.model');

const forbidden = (message) => httpError(403, 'forbidden', message);

const parseUserId = (req) => {
  const id = parseId(req.params.userId);
  if (id === null) throw httpError(404, 'not_found', 'Member not found.');
  return id;
};

// GET /api/circles/:circleId/members
exports.list = async (req, res, next) => {
  try {
    const members = await Member.listByCircle(req.circleId);
    const relationships = await Circle.getRelationships(req.circleId);
    res.json({ members: members.map((m) => toMember(m, relationships[m.user_id])) });

  } catch (err) {
    next(err);
  }
};

// Sent whether or not the email has an account, so this endpoint can't be used to find out who uses Nurture.
const ADDED = { message: "If that email belongs to a Nurture account, they're now in this circle." };

// POST /api/circles/:circleId/members
exports.add = async (req, res, next) => {
  try {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, 'validation_error',
        "Provide the person's account email and a role.");
    }
    const { email, role } = parsed.data;

    const user = await User.findByEmail(email);
    if (!user) return res.status(201).json(ADDED);

    await Member.create({
      circleId: req.circleId,
      userId: user.id,
      displayName: user.username,
      role,
    });

    res.status(201).json(ADDED);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/circles/:circleId/members/:userId
exports.remove = async (req, res, next) => {
  try {
    const userId = parseUserId(req);

    const target = await Member.findMembership(req.circleId, userId);
    if (!target) throw httpError(404, 'not_found', 'Member not found.');

    if (target.role === 'owner') throw forbidden("The owner can't be removed.");

    await Member.remove(req.circleId, userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};