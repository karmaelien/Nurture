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

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/circles', require('./routes/circles.routes'));

app.use('/api/admin', require('./routes/admin.routes'));

app.use((req,res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
});
app.use(errorHandler);
module.exports = app;
