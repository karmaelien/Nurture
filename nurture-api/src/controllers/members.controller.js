const { z } = require('zod');
const Member = require('../models/member.model');
const User = require('../models/user.model');
const { httpError } = require('../utils/httpErrors');
const { addSchema, roleSchema } = require('../validators/members.validators');
const { toMember } = require('../utils/serializers');

const forbidden = (message) => httpError(403, 'forbidden', message);

const parseUserId = (req) => {
  const id = Number(req.params.userId);
  if (!Number.isInteger(id) || id < 1) throw httpError(404, 'not_found', 'Member not found.');
  return id;
};

exports.list = async (req, res, next) => {
  try {
    const members = await Member.listByCircle(req.circleId);
    const relationships = await Circle.getRelationships(req.circleId);
    res.json({ members: members.map((m) => toMember(m, relationships[m.user_id])) });

  } catch (err) {
    next(err);
  }
};

exports.add = async (req, res, next) => {
  try {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, 'validation_error',
        "Provide the person's account email and a role.");
    }
    const { email, role, displayName } = parsed.data;

    const user = await User.findByEmail(email);
    if (!user) throw httpError(404, 'user_not_found', 'No account exists with that email.');

    const member = await Member.create({
      circleId: req.circleId,
      userId: user.id,
      displayName: displayName ?? user.username,
      role,
    });

    res.status(201).json({
      member: toMember({ ...member, username: user.username, email: user.email }),
    });
  } catch (err) {
    next(err);
  }
};

exports.updateRole = async (req, res, next) => {
  try {
    const updated = await Member.updateRole(req.circleId, userId, role);
    const user = await User.findById(userId);
    const relationships = await Circle.getRelationships(req.circleId);
    res.json({
      member: toMember({ ...updated, username: user.username, email: user.email }, relationships[userId]),
    });
  } catch (err) {
    next(err);
  }
};

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