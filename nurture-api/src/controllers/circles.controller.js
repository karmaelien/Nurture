const { z } = require('zod');
const db = require('../config/db');
const Circle = require('../models/circle.model');
const { httpError } = require('../utils/httpErrors');
const Member = require('../models/member.model');
const Recipient = require('../models/recipient.model');
const { createSchema, updateSchema } = require('../validators/circles.validators');
const { toRecipient } = require('../utils/serializers');

const create = async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, 'validation_error',
        'Provide a circle name, and optionally a budget as a whole number of cents.');
    }
    const { name, budget, recipient } = parsed.data;
    
    const { circle, dependent, relationship } = await db.transaction(async (tx) => {
      const circle = await Circle.create({ name, budget: budget ?? null, createdBy: req.user.id }, tx);
      await Member.create({
        circleId: circle.id, 
        userId: req.user.id, 
        displayName: req.user.username,
        role: 'owner'
      }, tx);
      const dependent = await Recipient.create({ 
        circleId: circle.id,
        name: recipient.name,
        preferredName: recipient.preferredName,
        dateOfBirth: recipient.dateOfBirth,
        notes: recipient.notes,

      }, tx);
      const relationship = await Recipient.setRelationship(
        req.user.id,
        dependent.id, 
        recipient.relationship,
        tx
      );
      return { circle, dependent, relationship };
    });
    res.status(201).json({ circle:{
      id: String(circle.id),
      name: circle.name,
      role: 'owner',
      recipients: [toRecipient(dependent, relationship)],
      } 
    });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, 'validation_error', 
        'Provide a circle name, and optionally a budget as a whole number of cents.');
    }
    const { name, budget} = parsed.data;

    const circle = await Circle.update(req.circleId, { name, budget: budget ?? null });
    const recipients = await Recipient.listByCircle(req.circleId, req.user.id);
    res.json({ circle:{
      id: String(circle.id),
      name: circle.name,
      role: req.membership.role,
      recipients: recipients.map((r) => toRecipient(r)),
      } 
    });
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
    const members = await Member.listByCircle(req.circleId);
    const recipients = await Recipient.listByCircle(req.circleId, req.user.id);
    const relationships = await Circle.getRelationships(req.circleId, req.user.id);

    res.json({
      circle: {
        id: String(circle.id),
        name: circle.name,
        role: req.membership.role,
        recipients: recipients.map((r) => toRecipient(r)),
        members: members.map((m) => (toMember(m, relationships[m.user_id] ?? null))),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { create, list, get, update };