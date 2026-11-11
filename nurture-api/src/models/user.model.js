const db = require('../config/db');

const PUBLIC_COLUMNS = 'id, email, username, created_at, updated_at';

const User = {
    create: async ({ email, passwordHash, username }, conn = db) => {
      const { rows } = await conn.query(
        `INSERT INTO users (email, password_hash, username)
        VALUES ($1, $2, $3)
        RETURNING ${PUBLIC_COLUMNS}`,
        [email, passwordHash, username]
      );
      return rows[0];
    },
    findAll: async (conn = db) => {
      const { rows } = await conn.query(`SELECT ${PUBLIC_COLUMNS} FROM users`);
      return rows;
    },
    findById: async (id, conn = db) => {
      const { rows } = await conn.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
      return rows[0] || null;
    },
    findByEmail: async (email, conn = db) => {
      const { rows } = await conn.query(`SELECT id, email, username, password_hash FROM users WHERE email = $1`, [email]);
      return rows[0] || null;
    },
    update: async (id, { email, passwordHash, username }, conn = db) => {
      const { rows } = await conn.query(
      `UPDATE users SET email = $1, password_hash = $2, username = $3 WHERE id = $4 RETURNING ${PUBLIC_COLUMNS}`,
      [email, passwordHash, username, id]
      );
      return rows[0] || null;
    },
    remove: async (id, conn = db) => {
      const { rows } = await conn.query(`DELETE FROM users WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`, [id]);
      return rows[0] || null;
    },

    createSession: async (userId, tokenHash, conn = db) => {
      await conn.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, now() + interval '4 hours')`,
        [userId, tokenHash]
      );
    },
    findBySession: async (tokenHash, conn = db) => {
      const { rows } = await conn.query(
        `WITH session AS (
        UPDATE refresh_tokens
        SET last_used_at = now()
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > now()
          AND last_used_at > now() - interval '30 minutes'
          RETURNING user_id
        )
        SELECT u.id, u.email, u.username, u.is_admin, u.created_at, u.updated_at
        FROM session
        JOIN users u ON u.id = session.user_id`,
        [tokenHash]
      );
      
      return rows[0] || null;
    },
    revokeSession: async (tokenHash, conn = db) => {
      await conn.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
        [tokenHash]
      );
    },
    revokeAllSessions: async (userId, conn = db) => {
      await conn.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId]
      );
    },
};



module.exports = User;