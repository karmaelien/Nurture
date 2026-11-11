const db = require('../config/db');

const COLUMNS = 'id, circle_id, name, created_at';

const Recipient = {
  findInCircle: async (circleId, recipientId, conn = db) => {
    const { rows } = await conn.query(
      `SELECT ${COLUMNS} FROM recipients
       WHERE circle_id = $1 AND id = $2`,
      [circleId, recipientId]
    );
    return rows[0] || null;
  },

  listByCircle: async (circleId,userId, conn = db) => {
    const { rows } = await conn.query(
      `SELECT r.id, r.name, cr.relationship
        FROM recipients r
        LEFT JOIN care_relationships cr
          ON cr.recipient_id = r.id AND cr.user_id = $2
        WHERE r.circle_id = $1
        ORDER BY r.created_at, r.id`,
        [circleId, userId]
    );
    return rows;
  },

  create: async ({ circleId, name }, conn = db) => {
    const { rows } = await conn.query(
      `INSERT INTO recipients (circle_id, name, updated_at)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [circleId, name, new Date()]
    );
    return rows[0];
  },

  remove: async (recipientId, conn = db) => {
    const { rowCount } = await conn.query(
      'DELETE FROM recipients WHERE id = $1',
      [recipientId]
    );
    return rowCount > 0;
  },
  setRelationship: async (userId, recipientId, relationship, conn = db) => {
    if (relationship === null) {
      const { rowCount } = await conn.query(
        `DELETE FROM care_relationships
         WHERE user_id = $1 AND recipient_id = $2`,
        [userId, recipientId]
      );
      return null;
    }
    else {
      const { rowCount } = await conn.query(
        `INSERT INTO care_relationships (user_id, recipient_id, relationship)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, recipient_id) DO UPDATE SET relationship = EXCLUDED.relationship`,
        [userId, recipientId, relationship]
      );
      return rowCount > 0 ? relationship : null;
    }
  },

  getRelationships: async (userId, circleId, conn = db) => {
    const { rows } = await conn.query(
      `SELECT r.id, cr.relationship
        FROM recipients r
        LEFT JOIN care_relationships cr ON r.id = cr.recipient_id AND cr.user_id = $1
        WHERE r.circle_id = $2`,
      [userId, circleId]
    );
    return rows.reduce((acc, row) => {
      acc[row.id] = row.relationship;
      return acc;
    }, {});
  },
  
};

module.exports = Recipient;