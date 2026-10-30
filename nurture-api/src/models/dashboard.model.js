const db = require('../config/db');
const Dashboard = {
    create: async (data) => {
        const result = await db.query('INSERT INTO dashboard (name, value) VALUES ($1, $2) RETURNING *', [data.name, data.value]);
        return result.rows[0];
    },
    findAll: async () => {
        const result = await db.query('SELECT * FROM dashboard');
        return result.rows;
    },
    findById: async (id) => {
        const result = await db.query('SELECT * FROM dashboard WHERE id = $1', [id]);
        return result.rows[0];
    },
    update: async (id, data) => {
        const result = await db.query('UPDATE dashboard SET name = $1, value = $2 WHERE id = $3 RETURNING *', [data.name, data.value, id]);
        return result.rows[0];
    },
    remove: async (id, data) => {
        const result = await db.query('DELETE FROM dashboard WHERE id = $1 RETURNING *', [id]);
        return result.rows[0];
    }
};

module.exports = Dashboard;