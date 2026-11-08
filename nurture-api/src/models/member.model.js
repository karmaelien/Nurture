const db = require('../config/db');

const COLUMNS = 'circle_id, user_id, display_name, role, created_at';

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
      `SELECT m.circle_id, m.user_id, m.display_name, m.role, m.created_at, u.email, u.username
      FROM circle_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.circle_id = $1
      ORDER BY m.created_at, m.user_id`,
      [circleId]
    );
    return rows;
  },

  create: async ({ circleId, userId, displayName, role }) => {
    const { rows } = await db.query(
      `INSERT INTO circle_members (circle_id, user_id, display_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS};`,
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
    const { crRowCount } = await db.query(
      `DELETE FROM care_relationships cr
      USING recipients r
      WHERE cr.recipient_id = r.id AND r.circle_id = $1 AND cr.user_id = $2`,
      [circleId, userId]
    );
    const { rowCount } = await db.query(
      `DELETE FROM circle_members WHERE circle_id = $1 AND user_id = $2;`,
      [circleId, userId]
    );
    return rowCount > 0;
  },
  
};

module.exports = Member;