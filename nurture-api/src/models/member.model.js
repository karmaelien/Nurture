const db = require('../config/db');

const COLUMNS = 'dashboard_id, user_id, display_name, role, created_at';

const Member = {
  findMembership: async (dashboardId, userId) => {
    const { rows } = await db.query(
      `SELECT ${COLUMNS} FROM dashboard_members
       WHERE dashboard_id = $1 AND user_id = $2`,
      [dashboardId, userId]
    );
    return rows[0] || null;
  },

  listByDashboard: async (dashboardId) => {
    const { rows } = await db.query(
      `SELECT ${COLUMNS} FROM dashboard_members
       WHERE dashboard_id = $1
       ORDER BY created_at, user_id`,
      [dashboardId]
    );
    return rows;
  },

  create: async ({ dashboardId, userId, displayName, role }) => {
    const { rows } = await db.query(
      `INSERT INTO dashboard_members (dashboard_id, user_id, display_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [dashboardId, userId, displayName, role]
    );
    return rows[0];
  },

  updateRole: async (dashboardId, userId, role) => {
    const { rows } = await db.query(
      `UPDATE dashboard_members SET role = $1
       WHERE dashboard_id = $2 AND user_id = $3
       RETURNING ${COLUMNS}`,
      [role, dashboardId, userId]
    );
    return rows[0] || null;
  },

  remove: async (dashboardId, userId) => {
    const { rowCount } = await db.query(
      'DELETE FROM dashboard_members WHERE dashboard_id = $1 AND user_id = $2',
      [dashboardId, userId]
    );
    return rowCount > 0;
  },
};

module.exports = Member;