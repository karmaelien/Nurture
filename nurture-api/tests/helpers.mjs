import { createRequire } from 'node:module';
import request from 'supertest';

// The app is CommonJS, so load it through Node's require instead of Vite's transform.
const require = createRequire(import.meta.url);
export const app = require('../src/app');
export const db = require('../src/config/db');

export const PASSWORD = 'correct horse battery staple';

// The auth routes are rate limited per IP. Giving each request its own address keeps
// limits from carrying over between tests; tests of the limiter pass a fixed `ip`.
let ipCount = 0;
export const nextIp = () => {
  ipCount += 1;
  return `10.${(ipCount >> 16) & 255}.${(ipCount >> 8) & 255}.${ipCount & 255}`;
};

export const api = (method, path, { token, body, ip = nextIp() } = {}) => {
  let req = request(app)[method](path).set('X-Forwarded-For', ip);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return body === undefined ? req : req.send(body);
};

let userCount = 0;
export const register = async (name = 'user') => {
  userCount += 1;
  const email = `${name.toLowerCase()}${userCount}@example.test`;
  const res = await api('post', '/api/auth/register', { body: { email, name, password: PASSWORD } });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, email };
};

export const recipientInput = (overrides = {}) => ({
  name: 'Rose',
  preferredName: null,
  dateOfBirth: null,
  notes: null,
  relationship: null,
  ...overrides,
});

export const createCircle = async (token, { name = 'Alvarez family', recipient = {} } = {}) => {
  const res = await api('post', '/api/circles', { token, body: { name, recipient: recipientInput(recipient) } });
  if (res.status !== 201) throw new Error(`create circle failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.circle;
};

export const addMember = async (ownerToken, circleId, email) => {
  const res = await api('post', `/api/circles/${circleId}/members`, {
    token: ownerToken,
    body: { email, role: 'member' },
  });
  if (res.status !== 201) throw new Error(`add member failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.member;
};

// Staff admin is only ever granted in the database, never through the API.
export const makeStaffAdmin = (userId) => db.query('UPDATE users SET is_admin = TRUE WHERE id = $1', [userId]);
