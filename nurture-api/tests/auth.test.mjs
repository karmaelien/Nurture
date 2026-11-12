import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { api, db, makeStaffAdmin, PASSWORD, register } from './helpers.mjs';

const login = (email, password = PASSWORD, opts = {}) =>
  api('post', '/api/auth/login', { body: { email, password }, ...opts });

describe('register', () => {
  it('creates an account and returns a session', async () => {
    const res = await api('post', '/api/auth/register', {
      body: { email: 'ann@example.test', name: 'Ann', password: PASSWORD },
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.circles).toEqual([]);
    expect(res.body.user).toMatchObject({
      id: expect.any(String),
      name: 'Ann',
      email: 'ann@example.test',
      phone: null,
      timeZone: null,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('stores emails lowercased, so they are unique regardless of case', async () => {
    await api('post', '/api/auth/register', {
      body: { email: 'Ann@Example.test', name: 'Ann', password: PASSWORD },
    });
    const res = await api('post', '/api/auth/register', {
      body: { email: 'ann@example.test', name: 'Other Ann', password: PASSWORD },
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
  });

  it.each([
    ['a short password', { email: 'a@example.test', name: 'A', password: 'short' }],
    ['a password over 128 characters', { email: 'a@example.test', name: 'A', password: 'x'.repeat(129) }],
    ['an invalid email', { email: 'not-an-email', name: 'A', password: PASSWORD }],
    ['a missing name', { email: 'a@example.test', password: PASSWORD }],
  ])('rejects %s', async (_label, body) => {
    const res = await api('post', '/api/auth/register', { body });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});

describe('login', () => {
  it('returns a new session for the right password', async () => {
    const { email } = await register('Ann');
    const res = await login(email);

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email);
    expect(res.body.circles).toEqual([]);
  });

  it('accepts the email in any case', async () => {
    const { email } = await register('Ann');
    const res = await login(email.toUpperCase());

    expect(res.status).toBe(200);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const { email } = await register('Ann');
    const wrongPassword = await login(email, 'not the password');
    const unknownEmail = await login('nobody@example.test');

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe('invalid_credentials');
  });

  it('locks an account after five failed attempts, even from different addresses', async () => {
    const { email } = await register('Ann');
    for (let i = 0; i < 5; i += 1) {
      expect((await login(email, 'wrong password')).status).toBe(401);
    }

    const res = await login(email);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('too_many_attempts');
  });

  it('limits repeated requests from one address', async () => {
    const ip = '192.0.2.10';
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await login(`nobody${i}@example.test`, 'wrong password', { ip })).status);
    }

    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('sessions', () => {
  it('stores only a hash of the token', async () => {
    const { token } = await register('Ann');
    const { rows } = await db.query('SELECT token_hash FROM refresh_tokens');

    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).toBe(createHash('sha256').update(token).digest('hex'));
  });

  it('rejects requests without a valid bearer token', async () => {
    const missing = await api('get', '/api/auth/me');
    const garbage = await api('get', '/api/auth/me', { token: 'not-a-real-token' });
    const wrongScheme = await api('get', '/api/auth/me').set('Authorization', 'Basic abc');

    for (const res of [missing, garbage, wrongScheme]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthorized');
    }
  });

  it('logs out only the current device', async () => {
    const { email } = await register('Ann');
    const phone = (await login(email)).body.token;
    const laptop = (await login(email)).body.token;

    const out = await api('post', '/api/auth/logout', { token: phone });

    expect(out.status).toBe(204);
    expect((await api('get', '/api/auth/me', { token: phone })).status).toBe(401);
    expect((await api('get', '/api/auth/me', { token: laptop })).status).toBe(200);
  });

  it('returns 204 when logging out with an invalid token', async () => {
    const res = await api('post', '/api/auth/logout', { token: 'not-a-real-token' });

    expect(res.status).toBe(204);
  });

  it('ends a session after it expires', async () => {
    const { token } = await register('Ann');
    await db.query(`UPDATE refresh_tokens SET expires_at = now() - interval '1 second'`);

    expect((await api('get', '/api/auth/me', { token })).status).toBe(401);
  });

  it('ends a session after 30 minutes without use', async () => {
    const { token } = await register('Ann');
    await db.query(`UPDATE refresh_tokens SET last_used_at = now() - interval '31 minutes'`);

    expect((await api('get', '/api/auth/me', { token })).status).toBe(401);
  });

  it('ends every session when an admin revokes them', async () => {
    const admin = await register('Staff');
    const target = await register('Ann');
    await makeStaffAdmin(admin.user.id);

    const res = await api('post', `/api/admin/users/${target.user.id}/sessions/revoke`, { token: admin.token });

    expect(res.status).toBe(204);
    expect((await api('get', '/api/auth/me', { token: target.token })).status).toBe(401);
    expect((await api('get', '/api/auth/me', { token: admin.token })).status).toBe(200);
  });
});

describe('request handling', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await api('get', '/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('returns a 400 for malformed JSON', async () => {
    const res = await api('post', '/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});
