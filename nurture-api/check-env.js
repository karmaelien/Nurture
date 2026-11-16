require('dotenv').config();
console.log('JWT_SECRET set:', !!process.env.JWT_SECRET);

const c = require('./src/config/env');
console.log('env.js exports:', Object.keys(c));
console.log('jwtSecret is a string:', typeof c.jwtSecret === 'string');