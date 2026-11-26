const { test } = require('node:test');
const assert = require('node:assert/strict');
const { notificationKind, pushConfig, deliver } = require('../../src/services/medication-push');
const { subscriptionSchema } = require('../../src/validators/medication-notifications.validators');
const dose = {
  status: 'pending',
  scheduledAt: '2026-11-25T12:00:00.123Z',
  overdueAfterMinutes: 30,
  reminderBeforeMinutes: 15,
};
const at = Date.parse(dose.scheduledAt);

test('pushes respect the reminder window, missed grace, stop state, and taken state', () => {
  assert.equal(notificationKind(dose, at - 15 * 60_000 - 1), null);
  assert.equal(notificationKind(dose, at - 15 * 60_000), 'reminder');
  assert.equal(notificationKind(dose, at + 30 * 60_000 - 1), 'reminder');
  assert.equal(notificationKind(dose, at + 30 * 60_000), 'missed');
  assert.equal(notificationKind(dose, at + 35 * 60_000), null);
  assert.equal(notificationKind({ ...dose, status: 'completed' }, at), null);
  assert.equal(notificationKind({ ...dose, medicationStoppedAt: '2026-11-25T11:00:00Z' }, at), null);
  assert.equal(notificationKind({ ...dose, reminderBeforeMinutes: null }, at), null);
  assert.equal(notificationKind({ ...dose, reminderBeforeMinutes: null }, at + 30 * 60_000), 'missed');
  assert.equal(
    notificationKind({ ...dose, scheduledAt: new Date(dose.scheduledAt) }, at + 30 * 60_000 - 1),
    'reminder',
  );
});

test('push stays disabled without both feature flags and complete VAPID settings', () => {
  assert.equal(pushConfig({}), null);
  const env = {
    ENABLE_MEDICATIONS_API: 'true',
    ENABLE_MEDICATION_PUSH: 'true',
    VAPID_PUBLIC_KEY: 'public',
    VAPID_PRIVATE_KEY: 'private',
    VAPID_SUBJECT: 'mailto:admin@example.test',
  };
  assert.ok(pushConfig(env));
  assert.equal(pushConfig({ ...env, ENABLE_MEDICATIONS_API: 'false' }), null);
  assert.equal(pushConfig({ ...env, VAPID_PRIVATE_KEY: '' }), null);
});

test('push subscriptions reject private endpoints, credentials, custom ports, and malformed encryption keys', () => {
  const valid = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    expirationTime: null,
    keys: {
      p256dh: Buffer.alloc(65).toString('base64url'),
      auth: Buffer.alloc(16).toString('base64url'),
    },
  };
  assert.equal(subscriptionSchema.safeParse(valid).success, true);
  for (const endpoint of [
    '',
    'not-a-url',
    'https://',
    'https://127.0.0.1/admin',
    'http://fcm.googleapis.com/test',
    'https://fcm.googleapis.com.evil.test/',
    'https://fcm.googleapis.com:444/',
    'https://user:pass@fcm.googleapis.com/',
  ])
    assert.equal(subscriptionSchema.safeParse({ ...valid, endpoint }).success, false);
  assert.equal(
    subscriptionSchema.safeParse({
      ...valid,
      keys: { ...valid.keys, auth: 'x' },
    }).success,
    false,
  );
});

test('expired push endpoints are removed and transient failures reject the transaction for retry', async () => {
  async function attempt(statusCode) {
    const queries = [];
    const db = {
      transaction: (action) =>
        action({
          query: async (sql) => {
            queries.push(sql);
            if (sql.includes('SELECT s.subscription'))
              return {
                rows: [
                  {
                    ...dose,
                    scheduledAt: new Date(Date.now() + 60_000),
                    id: 1,
                    circleId: '1',
                    subscription: {
                      endpoint: 'https://fcm.googleapis.com/test',
                    },
                  },
                ],
              };
            return { rows: [{ subscription_id: 1 }], rowCount: 1 };
          },
        }),
    };
    const action = deliver(db, 1, 'dose', 'reminder', {}, async () => {
      throw Object.assign(new Error('push unavailable'), { statusCode });
    });
    if (statusCode === 410) assert.equal(await action, false);
    else await assert.rejects(action, /push unavailable/);
    assert.equal(
      queries.some((sql) => sql.includes('DELETE FROM medication_push_subscriptions')),
      statusCode === 410,
    );
  }
  await attempt(410);
  await attempt(503);
});
