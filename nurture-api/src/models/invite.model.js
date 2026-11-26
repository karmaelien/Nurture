const db = require('../config/db');

const Invite = {
    create: async ({ circleId, userId, tokenHash}, conn = db) => {
        const { rows } = await conn.query(
          `INSERT INTO invites (circle_id, user_id, token_hash)
           VALUES ($1, $2, $3);`,
          [circleId, userId, tokenHash]
        );
        return rows[0];
    },
    listCircleInvites: async({circleId}, conn = db) => {
        const { rows } = await conn.query(
            `SELECT (circleId, invitee_id, status) FROM invites WHERE
            circledId = $1;`,
            [circleId]
        );
        return rows[0];
    },
    update: async({circleId, userId, new_status}, conn = db) => {
        const { rows } = await conn.query(
            `UPDATE invites SET status = $3 WHERE 
            (circle_id, user_id) = VALUES ($1, $2);`,
            [circleId, userId, new_status]
        );
        return rows[0];
    },
    remove: async ({ circleId, userId}, conn = db) => {
        const { rows } = await conn.query(
          `DELETE FROM invites WHERE
          (circle_id, user_id) = VALUES ($1, $2);`,
          [circleId, userId]
        );
        return rows[0];
    },
}