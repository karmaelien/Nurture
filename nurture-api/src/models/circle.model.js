const db = require('../config/db');

const COLUMNS = 'id, name, budget, created_by, created_at, updated_at';

const Circle = {
  create: async ({ name, budget, createdBy }) => {
    const { rows } = await db.query(
      `INSERT INTO circles (name, budget, created_by)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [name, budget, createdBy]
    );
    return rows[0];
  },

  findAll: async () => {
    const { rows } = await db.query(`SELECT ${COLUMNS} FROM circles ORDER BY name`);
    return rows;
  },

  findById: async (id) => {
    const { rows } = await db.query(`SELECT ${COLUMNS} FROM circles WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  findByOwnerId: async (ownerId) => {
    const { rows } = await db.query(
      `SELECT ${COLUMNS} FROM circles
       WHERE created_by = $1
       ORDER BY name`,
      [ownerId]
    );
    return rows;
  },

  findByOccupancy: async (userId) => {
    const { rows } = await db.query(
      `SELECT d.id, d.name, d.budget, d.created_by, d.created_at, d.updated_at, dm.role
       FROM circles d
       JOIN circle_members dm ON dm.circle_id = d.id
       WHERE dm.user_id = $1
       ORDER BY d.name`,
      [userId]
    );
    return rows;
  },

  update: async (id, { name, budget }) => {
    const { rows } = await db.query(
      `UPDATE circles SET name = $1, budget = COALESCE($2, budget), updated_at = now()
       WHERE id = $3
       RETURNING ${COLUMNS}`,
      [name, budget, id]
    );
    return rows[0] || null;
  },

  remove: async (id) => {
    const { rows } = await db.query(`DELETE FROM circles WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
    return rows[0] || null;
  },
  getRelationships: async (circleId) => {
    const { rows } = await db.query(
      `SELECT cr.user_id, cr.recipient_id, cr.relationship
      FROM care_relationships cr
      JOIN recipients r ON r.id = cr.recipient_id
      WHERE r.circle_id = $1`,
      [circleId]
    );

    const byUser = {};
    for (const { user_id, recipient_id, relationship } of rows) {
      byUser[user_id] ??= {};
      byUser[user_id][recipient_id] = relationship;
    }
    return byUser;
  },
};

module.exports = Circle;
