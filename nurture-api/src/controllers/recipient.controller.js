const { addSchema, relationshipSchema, updateSchema } = require('../validators/recipients.validators');
const db = require('../config/db');
const Recipient = require('../models/recipient.model');
const { httpError } = require('../utils/httpErrors');
const { parseId } = require('../utils/ids');
const { toRecipient } = require('../utils/serializers');

// POST /api/circles/:circleId/recipients
exports.add = async (req, res, next) => {
  try {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, 'validation_error', 'Provide a name (1 to 80 characters) and a relationship, or null.');
    }
    const { relationship, ...profile } = parsed.data;

    const { recipient, label } = await db.transaction(async (tx) => {
      const recipient = await Recipient.create({ circleId: req.circleId, ...profile }, tx);
      const label = await Recipient.setRelationship(req.user.id, recipient.id, relationship, tx);
      return { recipient, label };
    });
    res.status(201).json({ recipient: toRecipient(recipient, label) });
  } catch (err) {
    next(err);
  }
};

// PUT /api/circles/:circleId/recipients/:recipientId/relationship
exports.updateRelationship = async (req, res, next) => {
  try {
    const recipientId = parseId(req.params.recipientId);
    const recipient = recipientId === null
      ? null
      : await Recipient.findInCircle(req.circleId, recipientId);
    if (!recipient) throw httpError(404, 'not_found', 'Recipient not found.');

    const parsed = relationshipSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, 'validation_error', 'Provide a relationship, or null to clear it.');
    }

    const label = await Recipient.setRelationship(req.user.id, recipient.id, parsed.data.relationship);
    res.json({ recipient: toRecipient(recipient, label) });
  } catch (err) {
    next(err);
  }
};

//PATCH api/circles/:circleId/recipients/:recipientId
exports.update = async(req, res, next) => {
  try {
    const recipientId = parseId(req.params.recipientId);
    const recipient_exists = recipientId && await Recipient.findInCircle(req.circleId, recipientId);
    if (!recipient_exists) throw httpError(404, 'not_found', 'This person is not in the care circle.');
    
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success){
      throw httpError(400, 'validation_error', parsed.error.issues[0].message);
    }
    const { version, ...fields } = parsed.data;

    const updated = await Recipient.update({ circleId: req.circleId, recipientId, version, fields });
    const label = (await Recipient.getRelationships(req.user.id, req.circleId))[recipientId] ?? null;

    if (!updated){
      const exists = await Recipient.findInCircle(req.circleId, recipientId);
      if (!exists){
        throw httpError(404, 'not_found','This person is not in the care circle.')
      }
      return res.status(409).json({
        error: { code: 'edit_conflict', message: 'Someone else saved changes to this person first.' },
        recipient: toRecipient(exists, label),
      });
    }
    
    res.json({ recipient: toRecipient(updated, label) });
  } catch (err) {
    next(err);
  }

};