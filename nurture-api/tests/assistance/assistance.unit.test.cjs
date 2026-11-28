const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  createSchema,
  querySchema,
  notificationSchema,
} = require('../../src/validators/assistance.validators');
const resources = require('../../src/data/assistance-resources.json');
test('validates reported costs, strict metadata, coverage reports, and notification versions', () => {
  const body = {
    requestId: randomUUID(),
    medicationId: '1',
    reason: 'price_increase',
    previousCostCents: 2000,
    currentCostCents: 3000,
    notes: ' Monthly refill ',
  };
  assert.equal(createSchema.parse(body).notes, 'Monthly refill');
  for (const change of [
    { previousCostCents: null },
    { currentCostCents: 2000 },
    { currentCostCents: 1500 },
    { currentCostCents: 12.5 },
    { currentCostCents: 100000001 },
    { medicationId: '-1' },
    { reason: 'other' },
    { reportedBy: '2' },
    { recipientId: '2' },
    { notes: 'x'.repeat(501) },
    { requestId: 'invalid' },
  ])
    assert.equal(createSchema.safeParse({ ...body, ...change }).success, false);
  assert.equal(
    createSchema.safeParse({ ...body, reason: 'not_covered' }).success,
    false,
  );
  assert.equal(
    createSchema.safeParse({
      ...body,
      reason: 'not_covered',
      previousCostCents: null,
      currentCostCents: null,
    }).success,
    true,
  );
  assert.equal(
    notificationSchema.safeParse({ dismissed: true, version: 1 }).success,
    true,
  );
  assert.equal(
    notificationSchema.safeParse({ dismissed: true, version: 0 }).success,
    false,
  );
  assert.equal(
    notificationSchema.safeParse({
      dismissed: true,
      version: 1,
      currentCostCents: 20,
    }).success,
    false,
  );
  assert.equal(
    querySchema.safeParse({
      cursor: '2026-02-30T10:00:00.000Z|' + randomUUID(),
    }).success,
    false,
  );
  assert.equal(
    querySchema.safeParse({
      status: 'all',
      cursor: '2026-11-28T10:00:00.000Z|' + randomUUID(),
    }).success,
    true,
  );
});
test('curated resources use HTTPS links and describe directories without claiming eligibility', () => {
  assert.equal(
    new Set(resources.map((resource) => resource.id)).size,
    resources.length,
  );
  for (const resource of resources) {
    assert.equal(new URL(resource.url).protocol, 'https:');
    assert.ok(
      resource.title && resource.description && resource.reasons.length,
    );
  }
});
