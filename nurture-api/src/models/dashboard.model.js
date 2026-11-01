const db = require('../config/db');

const COLUMNS = 'id, name, budget, created_by, created_at, updated_at';

const Dashboard = {
  create: async ({ name, budget, createdBy }) => {
    const { rows } = await db.query(
      `INSERT INTO dashboards (name, budget, created_by)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [name, budget, createdBy]
    );
    return rows[0];
  },

  findAll: async () => {
    const { rows } = await db.query(`SELECT ${COLUMNS} FROM dashboards ORDER BY name`);
    return rows;
  },

  findById: async (id) => {
    const { rows } = await db.query(`SELECT ${COLUMNS} FROM dashboards WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  findByOwnerId: async (ownerId) => {
    const { rows } = await db.query(
      `SELECT ${COLUMNS} FROM dashboards
       WHERE created_by = $1
       ORDER BY name`,
      [ownerId]
    );
    return rows;
  },

  findByOccupancy: async (userId) => {
    const { rows } = await db.query(
      `SELECT d.id, d.name, d.budget, d.created_by, d.created_at, d.updated_at, dm.role
       FROM dashboards d
       JOIN dashboard_members dm ON dm.dashboard_id = d.id
       WHERE dm.user_id = $1
       ORDER BY d.name`,
      [userId]
    );
    return rows;
  },

  update: async (id, { name, budget }) => {
    const { rows } = await db.query(
      `UPDATE dashboards SET name = $1, budget = $2, updated_at = now()
       WHERE id = $3
       RETURNING ${COLUMNS}`,
      [name, budget, id]
    );
    return rows[0] || null;
  },

  remove: async (id) => {
    const { rows } = await db.query(`DELETE FROM dashboards WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
    return rows[0] || null;
  },
};

module.exports = Dashboard;
