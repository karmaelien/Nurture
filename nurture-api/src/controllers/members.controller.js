const { z } = require('zod');
const Member = require('../models/member.model');
const User = require('../models/user.model');
const { httpError } = require('../utils/httpErrors');

const ASSIGNABLE = ['admin', 'member'];

const { addSchema, roleSchema } = require('../validators/members.validators');

const forbidden = (message) => httpError(403, 'FORBIDDEN', message);

const parseUserId = (req) => {
  const id = Number(req.params.userId);
  if (!Number.isInteger(id) || id < 1) throw httpError(404, 'NOT_FOUND', 'Member not found.');
  return id;
};

exports.list = async (req, res, next) => {
  try {
    res.json({ members: await Member.listByDashboard(req.dashboardId) });
  } catch (err) {
    next(err);
  }
};

exports.add = async (req, res, next) => {
  try {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, 'validation_error',
        "Provide the person's account email and a role (admin or member).");
    }
    const { email, role, displayName } = parsed.data;

    if (role === 'admin' && req.membership.role !== 'owner') {
      throw forbidden('Only the owner can make someone an admin.');
    }

    const user = await User.findByEmail(email);
    if (!user) throw httpError(404, 'USER_NOT_FOUND', 'No account exists with that email.');

    const member = await Member.create({
      dashboardId: req.dashboardId,
      userId: user.id,
      displayName: displayName ?? user.username,
      role,
    });

    res.status(201).json({ member });
  } catch (err) {
    next(err);
  }
};

exports.updateRole = async (req, res, next) => {
  try {
    const userId = parseUserId(req);
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, 'validation_error', 'Provide a role: admin or member.');
    }
    const { role } = parsed.data;

    const target = await Member.findMembership(req.dashboardId, userId);
    if (!target) throw httpError(404, 'NOT_FOUND', 'Member not found.');

    if (target.role === 'owner') throw forbidden("The owner's role can't be changed.");
    if ((target.role === 'admin' || role === 'admin') && req.membership.role !== 'owner') {
      throw forbidden('Only the owner can grant or change the admin role.');
    }

    const member = await Member.updateRole(req.dashboardId, userId, role);
    res.json({ member });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const userId = parseUserId(req);

    const target = await Member.findMembership(req.dashboardId, userId);
    if (!target) throw httpError(404, 'NOT_FOUND', 'Member not found.');

    if (target.role === 'owner') throw forbidden("The owner can't be removed.");
    if (target.role === 'admin' && req.membership.role !== 'owner') {
      throw forbidden('Only the owner can remove an admin.');
    }

    await Member.remove(req.dashboardId, userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};