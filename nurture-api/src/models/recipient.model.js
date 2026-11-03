const db = require('../config/db');

const COLUMNS = 'circle_id, name, role, created_at';

const Recipient = {
  findInCircle: async (circleId, recipientId) => {
    const { rows } = await db.query(
      `SELECT ${COLUMNS} FROM recipients
       WHERE circle_id = $1 AND id = $2`,
      [circleId, recipientId]
    );
    return rows[0] || null;
  },

  listByCircle: async (circleId) => {
    const { rows } = await db.query(
      `SELECT ${COLUMNS} FROM recipients
       WHERE circle_id = $1
       ORDER BY created_at, name`,
      [circleId]
    );
    return rows;
  },

  create: async ({ circleId, displayName }) => {
    const { rows } = await db.query(
      `INSERT INTO recipients (circle_id, name, updated_at)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [circleId, displayName, new Date()]
    );
    return rows[0];
  },

  remove: async (recipientId) => {
    const { rowCount } = await db.query(
      'DELETE FROM recipients WHERE id = $1',
      [recipientId]
    );
    return rowCount > 0;
  },
};

module.exports = Recipient;