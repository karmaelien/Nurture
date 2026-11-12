const { addSchema, relationshipSchema } = require('../validators/recipients.validators');
const db = require('../config/db');
const Recipient = require('../models/recipient.model');
const { httpError } = require('../utils/httpErrors');
const { toRecipient } = require('../utils/serializers');

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

exports.updateRelationship = async (req, res, next) => {
  try {
    const recipientId = Number(req.params.recipientId);
    const recipient = Number.isInteger(recipientId) && recipientId > 0
      ? await Recipient.findInCircle(req.circleId, recipientId)
      : null;
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