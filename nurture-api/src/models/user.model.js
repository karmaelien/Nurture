const db = require('../config/db');

const PUBLIC_COLUMNS = 'id, email, username, created_at, updated_at';

const User = {
    create: async ({ email, passwordHash, username }) => {
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, username)
        VALUES ($1, $2, $3)
        RETURNING ${PUBLIC_COLUMNS}`,
        [email, passwordHash, username]
      );
      return rows[0];
    },
    findAll: async () => {
      const { rows } = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users`);
      return rows;
    },
    findById: async (id) => {
      const { rows } = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
      return rows[0] || null;
    },
    findByEmail: async (email) => {
      const { rows } = await db.query(`SELECT id, email, username, password_hash FROM users WHERE email = $1`, [email]);
      return rows[0] || null;
    },
    update: async (id, { email, passwordHash, username }) => {
      const { rows } = await db.query(
      `UPDATE users SET email = $1, password_hash = $2, username = $3 WHERE id = $4 RETURNING ${PUBLIC_COLUMNS}`,
      [email, passwordHash, username, id]
      );
      return rows[0] || null;
    },
    remove: async (id) => {
      const { rows } = await db.query(`DELETE FROM users WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`, [id]);
      return rows[0] || null;
    }
};

module.exports = User;