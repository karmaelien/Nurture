import { describe, expect, it } from 'vitest';
import { addMember, api, createCircle, recipientInput, register } from './helpers.mjs';

const patchMe = (token, body) => api('patch', '/api/users/me', { token, body });
const getMe = async (token) => (await api('get', '/api/auth/me', { token })).body;
const getCircle = (token, circleId) => api('get', `/api/circles/${circleId}`, { token });
const memberUser = (circleBody, userId) => circleBody.circle.members.find((m) => m.user.id === userId)?.user;

describe('editing your own profile', () => {
  it('updates name, phone, and time zone', async () => {
    const ann = await register('Ann');

    const res = await patchMe(ann.token, { name: 'Ann Lee', phone: '+1 (555) 010-0100', timeZone: 'America/New_York' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Ann Lee', phone: '+1 (555) 010-0100', timeZone: 'America/New_York' });
    expect((await getMe(ann.token)).user).toMatchObject({ phone: '+1 (555) 010-0100', timeZone: 'America/New_York' });
  });

  it('changes only the fields you send', async () => {
    const ann = await register('Ann');
    await patchMe(ann.token, { phone: '+1 555 0100', timeZone: 'UTC' });

    await patchMe(ann.token, { name: 'Ann Lee' });

    expect((await getMe(ann.token)).user).toMatchObject({ name: 'Ann Lee', phone: '+1 555 0100', timeZone: 'UTC' });
  });

  it('clears a field set to null or an empty string', async () => {
    const ann = await register('Ann');
    await patchMe(ann.token, { phone: '+1 555 0100', timeZone: 'UTC' });

    await patchMe(ann.token, { phone: null, timeZone: '' });

    expect((await getMe(ann.token)).user).toMatchObject({ phone: null, timeZone: null });
  });

  it.each([
    ['an empty body', {}],
    ['only fields that cannot be changed here', { email: 'evil@example.test' }],
    ['a phone number with letters', { phone: 'call me maybe' }],
    ['a phone number that is too short', { phone: '123' }],
    ['an unknown time zone', { timeZone: 'Mars/Olympus' }],
    ['an empty name', { name: '' }],
  ])('rejects %s', async (_label, body) => {
    const ann = await register('Ann');

    const res = await patchMe(ann.token, body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('ignores attempts to change the email or another account', async () => {
    const ann = await register('Ann');
    const ben = await register('Ben');

    const res = await patchMe(ann.token, { name: 'Ann Lee', email: 'evil@example.test', id: ben.user.id });

    expect(res.status).toBe(200);
    expect((await getMe(ann.token)).user).toMatchObject({ name: 'Ann Lee', email: ann.email });
    expect((await getMe(ben.token)).user).toMatchObject({ name: 'Ben', email: ben.email });
  });

  it('requires being signed in', async () => {
    expect((await patchMe(undefined, { name: 'Nobody' })).status).toBe(401);
  });

  it('has no route for reading or editing someone else by ID', async () => {
    const ann = await register('Ann');
    const ben = await register('Ben');

    expect((await api('get', `/api/users/${ben.user.id}`, { token: ann.token })).status).toBe(404);
    expect((await api('patch', `/api/users/${ben.user.id}`, { token: ann.token, body: { name: 'Hacked' } })).status).toBe(404);
    expect((await getMe(ben.token)).user.name).toBe('Ben');
  });
});

describe('who can see your profile', () => {
  const sharedSetup = async () => {
    const ann = await register('Ann');
    const ben = await register('Ben');
    await patchMe(ann.token, { phone: '+1 555 0100', timeZone: 'America/Chicago' });
    const circle = await createCircle(ann.token);
    return { ann, ben, circle };
  };

  it('people in a circle with you see your phone and time zone', async () => {
    const { ann, ben, circle } = await sharedSetup();
    await addMember(ann.token, circle.id, ben.email);

    const detail = await getCircle(ben.token, circle.id);
    const list = await api('get', `/api/circles/${circle.id}/members`, { token: ben.token });

    const expected = { id: ann.user.id, name: 'Ann', email: ann.email, phone: '+1 555 0100', timeZone: 'America/Chicago' };
    expect(memberUser(detail.body, ann.user.id)).toEqual(expected);
    expect(list.body.members.find((m) => m.user.id === ann.user.id).user).toEqual(expected);
  });

  it('people outside the circle cannot see it', async () => {
    const { ben, circle } = await sharedSetup();

    expect((await getCircle(ben.token, circle.id)).status).toBe(404);
    expect((await api('get', `/api/circles/${circle.id}/members`, { token: ben.token })).status).toBe(404);
  });

  it('a removed member stops seeing it straight away', async () => {
    const { ann, ben, circle } = await sharedSetup();
    await addMember(ann.token, circle.id, ben.email);
    expect((await getCircle(ben.token, circle.id)).status).toBe(200);

    await api('delete', `/api/circles/${circle.id}/members/${ben.user.id}`, { token: ann.token });

    expect((await getCircle(ben.token, circle.id)).status).toBe(404);
  });

  it("members of one circle can't learn about your other circles", async () => {
    const { ann, ben, circle } = await sharedSetup();
    const cat = await register('Cat');
    await addMember(ann.token, circle.id, ben.email);
    const second = await createCircle(ann.token, { name: 'Second circle', recipient: { name: 'Frank' } });
    await addMember(ann.token, second.id, cat.email);

    const asBen = JSON.stringify((await getCircle(ben.token, circle.id)).body);
    const bensSession = await getMe(ben.token);

    expect(asBen).not.toContain('Second circle');
    expect(asBen).not.toContain(cat.email);
    expect(asBen).not.toContain('Frank');
    expect(bensSession.circles.map((c) => c.id)).toEqual([circle.id]);
  });

  it('never exposes password hashes, tokens, or admin flags', async () => {
    const { ann, ben, circle } = await sharedSetup();
    await addMember(ann.token, circle.id, ben.email);

    const responses = [
      await getCircle(ben.token, circle.id),
      await api('get', `/api/circles/${circle.id}/members`, { token: ben.token }),
      await api('get', '/api/auth/me', { token: ben.token }),
    ];

    for (const res of responses) {
      expect(JSON.stringify(res.body)).not.toMatch(/password|token_hash|is_admin/i);
    }
  });
});

describe('recipient profiles', () => {
  const rose = {
    name: 'Rose',
    preferredName: 'Grandma Rose',
    dateOfBirth: '1941-03-02',
    notes: 'Hard of hearing',
    relationship: 'grandparent',
  };

  it('are saved and returned with every field', async () => {
    const ann = await register('Ann');
    const created = await createCircle(ann.token, { recipient: rose });

    const detail = await getCircle(ann.token, created.id);

    expect(created.recipients[0]).toEqual({ id: expect.any(String), ...rose });
    expect(detail.body.circle.recipients).toEqual([{ id: created.recipients[0].id, ...rose }]);
  });

  it('come back from a member-added recipient too', async () => {
    const ann = await register('Ann');
    const circle = await createCircle(ann.token);

    const res = await api('post', `/api/circles/${circle.id}/recipients`, {
      token: ann.token,
      body: { ...rose, name: 'Frank', relationship: null },
    });

    expect(res.status).toBe(201);
    expect(res.body.recipient).toEqual({ id: expect.any(String), ...rose, name: 'Frank', relationship: null });
  });

  it('store empty optional fields as null', async () => {
    const ann = await register('Ann');
    const circle = await createCircle(ann.token, {
      recipient: { preferredName: '  ', dateOfBirth: '', notes: '' },
    });

    expect(circle.recipients[0]).toMatchObject({ preferredName: null, dateOfBirth: null, notes: null });
  });

  it.each([
    ['an impossible date', { dateOfBirth: '2024-13-45' }],
    ['a date that rolls over', { dateOfBirth: '2023-02-30' }],
    ['a future date', { dateOfBirth: '2999-01-01' }],
    ['a date before 1900', { dateOfBirth: '1899-12-31' }],
    ['a date in another format', { dateOfBirth: '03/02/1941' }],
    ['notes over 500 characters', { notes: 'x'.repeat(501) }],
    ['a preferred name over 80 characters', { preferredName: 'x'.repeat(81) }],
    ['an unknown relationship', { relationship: 'cousin' }],
  ])('reject %s', async (_label, overrides) => {
    const ann = await register('Ann');
    const circle = await createCircle(ann.token);

    const res = await api('post', `/api/circles/${circle.id}/recipients`, {
      token: ann.token,
      body: recipientInput(overrides),
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});

describe('relationship labels in shared views', () => {
  it("show each person their own label and everyone's labels per member", async () => {
    const ann = await register('Ann');
    const ben = await register('Ben');
    const circle = await createCircle(ann.token, { recipient: { relationship: 'grandparent' } });
    await addMember(ann.token, circle.id, ben.email);
    const recipientId = circle.recipients[0].id;

    const res = await getCircle(ben.token, circle.id);
    const byUser = Object.fromEntries(res.body.circle.members.map((m) => [m.user.id, m.relationships]));

    // Ben hasn't labelled Rose, so his own view has no label, but he can see Ann's.
    expect(res.body.circle.recipients[0].relationship).toBeNull();
    expect(byUser[ann.user.id]).toEqual({ [recipientId]: 'grandparent' });
    // The contract says a member with no labels has an empty object, not null.
    expect(byUser[ben.user.id]).toEqual({});
  });
});
