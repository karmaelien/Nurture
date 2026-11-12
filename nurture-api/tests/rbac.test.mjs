import { beforeEach, describe, expect, it } from 'vitest';
import { addMember, api, createCircle, db, makeStaffAdmin, recipientInput, register } from './helpers.mjs';

// One circle with an owner, a member, and an outsider who belongs to no circle.
let owner, member, outsider, circle;
beforeEach(async () => {
  owner = await register('Owner');
  member = await register('Member');
  outsider = await register('Outsider');
  circle = await createCircle(owner.token);
  await addMember(owner.token, circle.id, member.email);
});

describe('circle creation', () => {
  it('makes the creator the owner', async () => {
    const mine = await createCircle(outsider.token, { name: 'Lee family' });

    expect(mine).toMatchObject({ id: expect.any(String), name: 'Lee family', role: 'owner' });
    expect(mine.recipients).toHaveLength(1);
  });

  it('lists only the circles you belong to', async () => {
    const res = await api('get', '/api/circles', { token: outsider.token });

    expect(res.status).toBe(200);
    expect(res.body.circles.map((c) => String(c.id))).not.toContain(circle.id);
  });
});

describe('people outside a circle', () => {
  // A non-member must not be able to tell the circle exists, so every route answers 404, never 403.
  it.each([
    ['view the circle', 'get', () => `/api/circles/${circle.id}`, undefined],
    ['list its members', 'get', () => `/api/circles/${circle.id}/members`, undefined],
    ['rename it', 'patch', () => `/api/circles/${circle.id}`, { name: 'Taken' }],
    ['add a member', 'post', () => `/api/circles/${circle.id}/members`, { email: 'x@example.test', role: 'member' }],
    ['add a recipient', 'post', () => `/api/circles/${circle.id}/recipients`, recipientInput()],
  ])('get 404 when they try to %s', async (_label, method, path, body) => {
    const res = await api(method, path(), { token: outsider.token, body });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('get the same 404 for a circle that does not exist', async () => {
    const res = await api('get', '/api/circles/999999', { token: outsider.token });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it.each(['abc', '0', '-1', '1.5', '99999999999'])('get 404 for the circle ID %s', async (id) => {
    const res = await api('get', `/api/circles/${id}`, { token: owner.token });

    expect(res.status).toBe(404);
  });

  it('need to be signed in at all', async () => {
    const res = await api('get', `/api/circles/${circle.id}`);

    expect(res.status).toBe(401);
  });
});

describe('members', () => {
  it('can view the circle and its members', async () => {
    expect((await api('get', `/api/circles/${circle.id}`, { token: member.token })).status).toBe(200);
    expect((await api('get', `/api/circles/${circle.id}/members`, { token: member.token })).status).toBe(200);
  });

  it('can add recipients', async () => {
    const res = await api('post', `/api/circles/${circle.id}/recipients`, {
      token: member.token,
      body: recipientInput({ name: 'Frank' }),
    });

    expect(res.status).toBe(201);
  });

  it.each([
    ['rename the circle', 'patch', () => `/api/circles/${circle.id}`, () => ({ name: 'Taken' })],
    ['add a member', 'post', () => `/api/circles/${circle.id}/members`, () => ({ email: outsider.email, role: 'member' })],
    ['remove a member', 'delete', () => `/api/circles/${circle.id}/members/${owner.user.id}`, () => undefined],
  ])('get 403 when they try to %s', async (_label, method, path, body) => {
    const res = await api(method, path(), { token: member.token, body: body() });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });
});

describe('owners', () => {
  it('can rename the circle', async () => {
    const res = await api('patch', `/api/circles/${circle.id}`, { token: owner.token, body: { name: 'Renamed' } });

    expect(res.status).toBe(200);
    expect(res.body.circle.name).toBe('Renamed');
  });

  it('can only add people as members, never as owners', async () => {
    const res = await api('post', `/api/circles/${circle.id}/members`, {
      token: owner.token,
      body: { email: outsider.email, role: 'owner' },
    });

    expect(res.status).toBe(400);
  });

  it('get a 409 when adding someone who is already a member', async () => {
    const res = await api('post', `/api/circles/${circle.id}/members`, {
      token: owner.token,
      body: { email: member.email, role: 'member' },
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('already_member');
  });

  it('cannot remove themselves', async () => {
    const res = await api('delete', `/api/circles/${circle.id}/members/${owner.user.id}`, { token: owner.token });

    expect(res.status).toBe(403);
  });

  it('cut off a removed member immediately and delete their labels', async () => {
    const recipientId = circle.recipients[0].id;
    await api('put', `/api/circles/${circle.id}/recipients/${recipientId}/relationship`, {
      token: member.token,
      body: { relationship: 'friend' },
    });

    const res = await api('delete', `/api/circles/${circle.id}/members/${member.user.id}`, { token: owner.token });

    expect(res.status).toBe(204);
    expect((await api('get', `/api/circles/${circle.id}`, { token: member.token })).status).toBe(404);
    const { rows } = await db.query('SELECT 1 FROM care_relationships WHERE user_id = $1', [member.user.id]);
    expect(rows).toHaveLength(0);
  });
});

describe('relationship labels', () => {
  const labelPath = (recipientId) => `/api/circles/${circle.id}/recipients/${recipientId}/relationship`;

  it('can be set and cleared by any member', async () => {
    const recipientId = circle.recipients[0].id;

    const set = await api('put', labelPath(recipientId), { token: member.token, body: { relationship: 'friend' } });
    const cleared = await api('put', labelPath(recipientId), { token: member.token, body: { relationship: null } });

    expect(set.status).toBe(200);
    expect(set.body.recipient.relationship).toBe('friend');
    expect(cleared.status).toBe(200);
    expect(cleared.body.recipient.relationship).toBeNull();
  });

  it('cannot target a recipient in another circle', async () => {
    const other = await createCircle(outsider.token, { name: 'Lee family' });

    const res = await api('put', labelPath(other.recipients[0].id), {
      token: member.token,
      body: { relationship: 'friend' },
    });

    expect(res.status).toBe(404);
  });

  it.each(['abc', '99999999999'])('get 404 for the recipient ID %s', async (id) => {
    const res = await api('put', labelPath(id), { token: member.token, body: { relationship: 'friend' } });

    expect(res.status).toBe(404);
  });
});

describe('staff admins', () => {
  it('get no access inside circles they are not in', async () => {
    await makeStaffAdmin(outsider.user.id);

    const res = await api('get', `/api/circles/${circle.id}`, { token: outsider.token });

    expect(res.status).toBe(404);
  });

  it('can list accounts without seeing contact details', async () => {
    await makeStaffAdmin(outsider.user.id);
    await api('patch', '/api/users/me', { token: owner.token, body: { phone: '+1 555 0100' } });

    const res = await api('get', '/api/admin/users', { token: outsider.token });

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(3);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('555 0100');
    expect(text).not.toMatch(/password|token/i);
  });

  it('hide admin routes from everyone else', async () => {
    const res = await api('get', '/api/admin/users', { token: owner.token });

    expect(res.status).toBe(404);
  });
});
