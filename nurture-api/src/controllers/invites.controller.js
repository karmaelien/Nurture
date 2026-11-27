const { z } = require('zod');
const db = require('../config/db');
const Circle = require('../models/circle.model');
const Invite = require('../models/circle.model')
const { httpError } = require('../utils/httpErrors');
const { createSchema, updateSchema } = require('../validators/invites.validators');
const { generateToken, hashToken } = require('../utils/tokens');

// POST /api/invites/preview
const preview = async (req, res, next) => {
    try{
        const circle_invited_to = await Invite.previewCircle(req.circleId, req.userId)
        if (!circle_invited_to){
            throw httpError(404, 'not_found','Circle not found')
        }
        res.json({
              circle: {
                id: String(circle.id),
                name: circle.name,
                role: req.membership.role,
                recipients: recipients.map((r) => toRecipient(r)),
              },
            });
    }catch(err){
        next(err)
    }
}
// POST /api/invites/accept
const accept = async (req, res, next) => {
    try{
        const invite = await Invite.findById(req.circleId, req.userId)
        if (!invite){throw httpError(404, 'not_found','Invite not found')}
        const updated = await Invite.update(req.circleId, req.userId, 'accepted')
        if (!updated){throw httpError()}
        res.json()
    }catch(err){
        next(err)
    }
}
// POST /api/invites/decline
const decline = async (req, res, next) => {
    try{
        const invite = await Invite.findById(req.circleId, req.userId)
        if (!invite){throw httpError(404, 'not_found','Invite not found')}
        const updated = await Invite.update(req.circleId, req.userId, 'declined')
        if (!updated){throw httpError()}
        res.json()
    }catch(err){
        next(err)
    }
}