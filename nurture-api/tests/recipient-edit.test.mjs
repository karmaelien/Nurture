import { describe, expect, it } from 'vitest';
import { addMember, api, createCircle, recipientInput, register } from './helpers.mjs';

const recipientPath = (circleId, recipientId) => `/api/circles/${circleId}/recipients/${recipientId}`;
const patchRecipient = (token, circleId, recipientId, body) =>
  api('patch', recipientPath(circleId, recipientId), { token, body });
const setRelationship = (token, circleId, recipientId, relationship) =>
  api('put', `${recipientPath(circleId, recipientId)}/relationship`, { token, body: { relationship } });
const findRecipient = async (token, circleId, recipientId) => {
  const res = await api('get', `/api/circles/${circleId}`, { token });
  return res.body.circle.recipients.find((r) => r.id === recipientId);
};

// An owner with a circle, and a plain member of it, so tests can check any member may edit.
const setup = async (recipient = {}) => {
  const ann = await register('Ann');
  const ben = await register('Ben');
  const circle = await createCircle(ann.token, { recipient });
  await addMember(ann.token, circle.id, ben.email);
  return { ann, ben, circle, rose: circle.recipients[0] };
};

describe('Recipient.version in responses', () => {
  it('starts at 1 and is returned everywhere a recipient is', async () => {
    const ann = await register('Ann');
    const circle = await createCircle(ann.token);
    const rose = circle.recipients[0];
    expect(rose.version).toBe(1);

    const me = await api('get', '/api/auth/me', { token: ann.token });
    expect(me.body.circles[0].recipients[0].version).toBe(1);

    expect((await findRecipient(ann.token, circle.id, rose.id)).version).toBe(1);

    const added = await api('post', `/api/circles/${circle.id}/recipients`, {
      token: ann.token,
      body: recipientInput({ name: 'Frank' }),
    });
    expect(added.status).toBe(201);
    expect(added.body.recipient.version).toBe(1);

    const labelled = await setRelationship(ann.token, circle.id, rose.id, 'grandparent');
    expect(labelled.body.recipient.version).toBe(1);
  });
});

describe('PATCH /api/circles/:circleId/recipients/:recipientId', () => {
  it('lets any member edit, and bumps the version', async () => {
    const { ben, circle, rose } = await setup();

    const res = await patchRecipient(ben.token, circle.id, rose.id, { name: 'Rose Alvarez', version: 1 });

    expect(res.status).toBe(200);
    expect(res.body.recipient).toMatchObject({ id: rose.id, name: 'Rose Alvarez', version: 2 });
    expect(await findRecipient(ben.token, circle.id, rose.id)).toMatchObject({ name: 'Rose Alvarez', version: 2 });
  });

  it('changes only the fields sent', async () => {
    const { ann, circle, rose } = await setup({
      preferredName: 'Grandma Rose',
      dateOfBirth: '1940-05-01',
      notes: 'Likes tea',
    });

    const res = await patchRecipient(ann.token, circle.id, rose.id, { notes: 'Likes coffee', version: 1 });

    expect(res.status).toBe(200);
    expect(res.body.recipient).toMatchObject({
      name: 'Rose',
      preferredName: 'Grandma Rose',
      dateOfBirth: '1940-05-01',
      notes: 'Likes coffee',
      version: 2,
    });
  });

  it('clears optional fields sent as null or an empty string', async () => {
    const { ann, circle, rose } = await setup({ preferredName: 'Grandma Rose', notes: 'Likes tea' });

    const res = await patchRecipient(ann.token, circle.id, rose.id, { preferredName: null, notes: '', version: 1 });

    expect(res.status).toBe(200);
    expect(res.body.recipient).toMatchObject({ name: 'Rose', preferredName: null, notes: null, version: 2 });
  });

  it("returns the caller's own relationship label", async () => {
    const { ann, ben, circle, rose } = await setup();
    await setRelationship(ann.token, circle.id, rose.id, 'parent');
    await setRelationship(ben.token, circle.id, rose.id, 'grandparent');

    const res = await patchRecipient(ben.token, circle.id, rose.id, { name: 'Rose A', version: 1 });

    expect(res.body.recipient.relationship).toBe('grandparent');
  });

  it('ignores a relationship in the body', async () => {
    const { ann, circle, rose } = await setup();
    await setRelationship(ann.token, circle.id, rose.id, 'parent');

    const res = await patchRecipient(ann.token, circle.id, rose.id, { relationship: 'friend', version: 1 });

    expect(res.status).toBe(200);
    expect((await findRecipient(ann.token, circle.id, rose.id)).relationship).toBe('parent');
  });

  describe('edit conflicts', () => {
    it('rejects a stale version with 409 and the current details, and changes nothing', async () => {
      const { ann, ben, circle, rose } = await setup();
      await setRelationship(ben.token, circle.id, rose.id, 'friend');
      await patchRecipient(ann.token, circle.id, rose.id, { name: 'Rose Alvarez', version: 1 });

      const res = await patchRecipient(ben.token, circle.id, rose.id, { notes: 'Stale edit', version: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('edit_conflict');
      expect(res.body.error.message).toEqual(expect.any(String));
      expect(res.body.recipient).toMatchObject({
        id: rose.id,
        name: 'Rose Alvarez',
        notes: null,
        relationship: 'friend',
        version: 2,
      });
      expect(await findRecipient(ben.token, circle.id, rose.id)).toMatchObject({ notes: null, version: 2 });
    });

    it('lets only one of two simultaneous saves with the same version succeed', async () => {
      const { ann, ben, circle, rose } = await setup();

      const results = await Promise.all([
        patchRecipient(ann.token, circle.id, rose.id, { name: 'From Ann', version: 1 }),
        patchRecipient(ben.token, circle.id, rose.id, { name: 'From Ben', version: 1 }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const winner = results.find((r) => r.status === 200).body.recipient;
      expect(await findRecipient(ann.token, circle.id, rose.id)).toMatchObject({ name: winner.name, version: 2 });
    });

    it('accepts the next edit once the client uses the new version', async () => {
      const { ann, circle, rose } = await setup();
      await patchRecipient(ann.token, circle.id, rose.id, { name: 'Rose A', version: 1 });

      const res = await patchRecipient(ann.token, circle.id, rose.id, { name: 'Rose B', version: 2 });

      expect(res.status).toBe(200);
      expect(res.body.recipient).toMatchObject({ name: 'Rose B', version: 3 });
    });
  });

  describe('not found', () => {
    it.each([
      ['an ID that does not exist', '999999'],
      ['an ID that is not a number', 'abc'],
    ])('returns 404 for %s', async (_label, recipientId) => {
      const { ann, circle } = await setup();

      const res = await patchRecipient(ann.token, circle.id, recipientId, { name: 'X', version: 1 });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    });

    it('returns 404 for a recipient in a different circle, and leaves it alone', async () => {
      const { ann, circle } = await setup();
      const cat = await register('Cat');
      const other = await createCircle(cat.token, { name: 'Other family', recipient: { name: 'Frank' } });
      const frank = other.recipients[0];

      const res = await patchRecipient(ann.token, circle.id, frank.id, { name: 'Hacked', version: 1 });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
      expect(await findRecipient(cat.token, other.id, frank.id)).toMatchObject({ name: 'Frank', version: 1 });
    });

    it('returns 404 to someone outside the circle', async () => {
      const { circle, rose } = await setup();
      const cat = await register('Cat');

      const res = await patchRecipient(cat.token, circle.id, rose.id, { name: 'Hacked', version: 1 });

      expect(res.status).toBe(404);
    });
  });

  describe('validation', () => {
    it.each([
      ['a missing version', { name: 'Rose A' }],
      ['a version sent as a string', { name: 'Rose A', version: '1' }],
      ['a version of 0', { name: 'Rose A', version: 0 }],
      ['a fractional version', { name: 'Rose A', version: 1.5 }],
      ['an empty name', { name: '', version: 1 }],
      ['a null name', { name: null, version: 1 }],
      ['a name over 80 characters', { name: 'x'.repeat(81), version: 1 }],
      ['an impossible date of birth', { dateOfBirth: '1990-02-30', version: 1 }],
      ['a date of birth in the future', { dateOfBirth: '2999-01-01', version: 1 }],
      ['notes over 500 characters', { notes: 'x'.repeat(501), version: 1 }],
    ])('rejects %s with 400 and changes nothing', async (_label, body) => {
      const { ann, circle, rose } = await setup();

      const res = await patchRecipient(ann.token, circle.id, rose.id, body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
      expect(await findRecipient(ann.token, circle.id, rose.id)).toMatchObject({ name: 'Rose', version: 1 });
    });

    it('requires being signed in', async () => {
      const { circle, rose } = await setup();

      expect((await patchRecipient(undefined, circle.id, rose.id, { name: 'X', version: 1 })).status).toBe(401);
    });
  });
});

describe('PUT .../relationship', () => {
  it('does not change the version', async () => {
    const { ann, circle, rose } = await setup();

    const res = await setRelationship(ann.token, circle.id, rose.id, 'parent');

    expect(res.body.recipient).toMatchObject({ relationship: 'parent', version: 1 });
    expect((await patchRecipient(ann.token, circle.id, rose.id, { name: 'Rose A', version: 1 })).status).toBe(200);
  });
});
