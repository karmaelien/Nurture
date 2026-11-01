const express = require('express')
const db = require('./config/db')
const errorHandler = require('./middleware/errorHandler')

const app = express()
app.use(express.json())

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error(err);
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1/users', require('./routes/users.routes'));
app.use('/api/v1/dashboards', require('./routes/dashboard.routes'));

app.use((req,res) => {
  res.status(404).json({ error: 'Not Found' });
});
app.use(errorHandler);
module.exports = app;
