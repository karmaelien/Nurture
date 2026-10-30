const config = require('./config/env');
const app = require('./app');
const { pool } = require('./config/db');

const server = app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
});

const shutdown = () => {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);