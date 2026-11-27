const db = require('../config/db');

const Invite = {
    create: async ({ circleId, inviteeId, invitedBy}, conn = db) => {
        const { rows } = await conn.query(
            `INSERT INTO invites (circle_id, invitee_id, invited_by)
            VALUES ($1, $2, $3)
            ON CONFLICT (circle_id, invitee_id) DO UPDATE
            SET status = 'pending', invited_by = EXCLUDED.invited_by,
            created_at = now(), expires_at = now() + interval '7 days', responded_at = NULL`,
            [circleId, inviteeId, invitedBy]
        );
    },
    list: async(inviteeId, conn = db) => {
        const {rows} = await conn.query(
            `SELECT i.circle_id, c.name AS circle_name, u.username AS invited_by_name
            FROM invites i
            JOIN circles c ON c.id = i.circle_id
            LEFT JOIN users u ON u.id = i.invited_by
            WHERE i.invitee_id = $1 AND i.status = 'pending' AND i.expires_at > now()
            ORDER BY i.created_at`,
            [inviteeId]
        );
        return rows;
    },
    findPending: async (circleId, inviteeId, conn = db) => {
        const { rows } = await conn.query(
            `SELECT circle_id FROM invites
            WHERE circle_id = $1 AND invitee_id = $2 AND status = 'pending' AND expires_at > now()
            FOR UPDATE`,
            [circleId, inviteeId]
        );
        return rows[0] || null;
    },
    respond: async(circleId, inviteeId, new_status, conn = db) => {
        const { rows } = await conn.query(
            `UPDATE invites SET status = $3, responded_at = now()
            WHERE circle_id = $1 AND invitee_id = $2;`,
            [circleId, inviteeId, new_status]
        );
    },
}
module.exports = Invite