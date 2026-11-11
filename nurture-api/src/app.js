const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const db = require('./config/db')
const errorHandler = require('./middleware/errorHandler')
const logger = require('./utils/logger')
const crypto = require('crypto');

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const app = express()

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}))
app.use(express.json())

app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
});

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    logger.logError(err, req);
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/circles', require('./routes/circles.routes'));

app.use('/api/admin', require('./routes/admin.routes'));

app.use((req,res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
});
app.use(errorHandler);
module.exports = app;
