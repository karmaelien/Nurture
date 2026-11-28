const { z } = require('zod');
const db = require('../config/db');
const Circle = require('../models/circle.model');
const Member = require('../models/member.model')
const User = require('../models/user.model')
const Invite = require('../models/invite.model')
const { httpError } = require('../utils/httpErrors');
const { createSchema, updateSchema } = require('../validators/invites.validators');
const { toInvite, toCircleSummary } = require('../utils/serializers');
const { parseId } = require('../utils/ids');

// GET /api/invites
const list = async (req, res, next) => {
  try {
    const invites = await Invite.list(req.user.id);
    res.json({ invites: invites.map(toInvite) });
  } catch (err) {
    next(err);
  }
};
// POST /api/invites/:circleId/accept
const accept = async (req, res, next) => {
    try{
        const circleId = parseId(req.params.circleId);
        if (circleId === null) throw httpError(404, 'not_found', 'Invite not found.');

        await db.transaction(async (tx) => {
            const invite = await Invite.findPending(circleId, req.user.id, tx);
            if (!invite){
                 throw httpError(404, 'not_found', 'Invite not found.');
            }
            if (!(await Member.findMembership(circleId, req.user.id, tx))) {
                await Member.create({ circleId, userId: req.user.id, displayName: req.user.username, role: 'member' }, tx);
            }
            await Invite.respond(circleId, req.user.id, 'accepted', tx);
        });

        res.status(204).end();
    }catch(err){
        next(err)
    }
}
// POST /api/invites/:circleId/decline
const decline = async (req, res, next) => {
    try{
        const circleId = parseId(req.params.circleId);
        if (circleId === null) throw httpError(404, 'not_found', 'Invite not found.');

        await db.transaction(async (tx) => {
            const invite = await Invite.findPending(circleId, req.user.id, tx);
            if (!invite){
                 throw httpError(404, 'not_found', 'Invite not found.');
            }
            await Invite.respond(circleId, req.user.id, 'declined', tx);
        });
        res.status(204).end()
    }catch(err){
        next(err)
    }
}
// POST /api/circles/:circleId/invites
const create = async (req, res, next) => {
    try{
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
        throw httpError(400, 'validation_error', 'Enter an email address.');
    }
    const user = await User.findByEmail(parsed.data.email);
    if (user && user.id !== req.user.id) {
      await Invite.create({ circleId: req.circleId, inviteeId: user.id, invitedBy: req.user.id });
    }

    res.status(201).json({ message: 'If that email belongs to a Nurture account, they’ll see your invitation.' });
    }catch(err){
        next(err)
    }
}

module.exports = { create, list, accept, decline };