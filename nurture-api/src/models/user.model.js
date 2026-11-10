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
    },

    createSession: async (userId, tokenHash) => {
      await db.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, now() + interval '4 hours')`,
        [userId, tokenHash]
      );
    },
    findBySession: async (tokenHash) => {
      const { rows } = await db.query(
        `SELECT u.id, u.email, u.username, u.is_admin, u.created_at, u.updated_at
        FROM refresh_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()`,
        [tokenHash]
      );
      
      return rows[0] || null;
    },
    revokeSession: async (tokenHash) => {
      await db.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
        [tokenHash]
      );
    },
    revokeAllSessions: async (userId) => {
      await db.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId]
      );
    },
};



module.exports = User;