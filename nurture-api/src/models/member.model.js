const db = require('../config/db');

const COLUMNS = 'circle_id, name, role, created_at';

const Member = {
  findMembership: async (circleId, userId) => {
    const { rows } = await db.query(
      `SELECT ${COLUMNS} FROM circle_members
       WHERE circle_id = $1 AND user_id = $2`,
      [circleId, userId]
    );
    return rows[0] || null;
  },

  listByCircle: async (circleId) => {
    const { rows } = await db.query(
      `SELECT ${COLUMNS} FROM circle_members
       WHERE circle_id = $1
       ORDER BY created_at, user_id`,
      [circleId]
    );
    return rows;
  },

  create: async ({ circleId, userId, displayName, role }) => {
    const { rows } = await db.query(
      `INSERT INTO circle_members (circle_id, user_id, display_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [circleId, userId, displayName, role]
    );
    return rows[0];
  },

  updateRole: async (circleId, userId, role) => {
    const { rows } = await db.query(
      `UPDATE circle_members SET role = $1
       WHERE circle_id = $2 AND user_id = $3
       RETURNING ${COLUMNS}`,
      [role, circleId, userId]
    );
    return rows[0] || null;
  },

  remove: async (circleId, userId) => {
    const { rowCount } = await db.query(
      'DELETE FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, userId]
    );
    return rowCount > 0;
  },
};

module.exports = Member;