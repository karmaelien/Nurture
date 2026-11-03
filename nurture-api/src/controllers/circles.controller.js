const { z } = require('zod');
const Circle = require('../models/circle.model');
const { httpError } = require('../utils/httpErrors');
const Member = require('../models/member.model');
const Recipient = require('../models/recipient.model');
const { createSchema } = require('../validators/circles.validators');

const create = async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, 'VALIDATION_ERROR',
        'Provide a circle name, and optionally a budget as a whole number of cents.');
    }
    const { name, budget, recipient } = parsed.data;

const circle = await Circle.create({ name, budget: budget ?? null, createdBy: req.user.id });
await Member.create({ 
  circleId: circle.id, 
  userId: req.user.id, 
  displayName: req.user.username,
  role: 'owner'
 });
await Recipient.create({ 
  circleId: circle.id, 
  displayName: req.user.username,
 });
    res.status(201).json({ circle });
  } catch (err) {
    next(err);
  }
};
const update = async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, 'VALIDATION_ERROR',
        'Provide a circle name, and optionally a budget as a whole number of cents.');
    }
    const { name, budget } = parsed.data;

    const circle = await Circle.update(req.circleId, { name, budget: budget ?? null });
    res.json({ circle });
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const circles = await Circle.findByOccupancy(req.user.id);
    res.json({ circles });
  } catch (err) {
    next(err);
  }
};

const get = async (req, res, next) => {
  try {
    // requirePermission already confirmed membership and set req.circleId
    const circle = await Circle.findById(req.circleId);
    const myRole = await Member.findMembership(req.circleId, req.user.id);
    res.json({ circle: { ...circle, role: myRole } });
  } catch (err) {
    next(err);
  }
};

module.exports = { create, list, get };