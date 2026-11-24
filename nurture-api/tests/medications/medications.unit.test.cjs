const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const createMedicationRouter = require('../../src/routes/medications.routes');
const errorHandler = require('../../src/middleware/errorHandler');
const {
  detailsSchema,
  rangeSchema,
  doseStatusSchema,
} = require('../../src/validators/medications.validators');
const { doseInstant, generateMedicationDoses } = require('../../src/services/medication-schedule');

const definition = {
  id: '1',
  version: 1,
  recipientId: '2',
  name: 'Sample',
  dosage: '1 tablet',
  assignedCaregiverId: null,
  schedule: {
    times: ['08:00'],
    timeZone: 'America/New_York',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startsOn: '2026-03-07',
    end: { kind: 'afterDays', days: 3 },
    overdueAfterMinutes: 30,
    reminderBeforeMinutes: 15,
  },
};
const { id, version, ...details } = definition;

test('schedules preserve wall-clock time across DST and include the last course date', () => {
  const doses = generateMedicationDoses(definition, '2026-03-06T00:00:00Z', '2026-03-11T00:00:00Z');
  assert.deepEqual(
    doses.map((dose) => dose.scheduledAt),
    ['2026-03-07T13:00:00.000Z', '2026-03-08T12:00:00.000Z', '2026-03-09T12:00:00.000Z'],
  );
  assert.equal(doses[0].reminderBeforeMinutes, 15);
  assert.deepEqual(
    generateMedicationDoses(definition, '2026-03-06T00:00:00Z', '2026-03-11T00:00:00Z'),
    doses,
  );
});
test('spring gaps shift forward, fall repeats use the first instant, and colliding times deduplicate', () => {
  assert.equal(doseInstant('2026-03-08', '02:30', 'America/New_York'), '2026-03-08T07:30:00.000Z');
  assert.equal(doseInstant('2026-11-01', '01:30', 'America/New_York'), '2026-11-01T05:30:00.000Z');
  const medication = { ...definition, schedule: { ...definition.schedule, times: ['02:30', '03:30'] } };
  assert.equal(generateMedicationDoses(medication, '2026-03-08T00:00:00Z', '2026-03-09T00:00:00Z').length, 1);
});
test('selected weekdays, timezone boundaries, and query bounds determine occurrences', () => {
  const medication = {
    ...definition,
    schedule: {
      ...definition.schedule,
      startsOn: '2026-11-23',
      end: { kind: 'never' },
      times: ['00:05'],
      timeZone: 'Asia/Tokyo',
      daysOfWeek: [1],
    },
  };
  const doses = generateMedicationDoses(medication, '2026-11-22T00:00:00Z', '2026-11-24T00:00:00Z');
  assert.deepEqual(
    doses.map((dose) => dose.scheduledAt),
    ['2026-11-22T15:05:00.000Z'],
  );
  assert.equal(
    generateMedicationDoses(medication, doses[0].scheduledAt, '2026-11-22T15:05:00.001Z').length,
    1,
  );
  assert.equal(generateMedicationDoses(medication, '2026-11-22T15:04:00Z', doses[0].scheduledAt).length, 0);
});
test('rejects malformed, duplicate, impossible, and empty-course schedules without throwing', () => {
  for (const change of [
    { times: ['08:00', '08:00'] },
    { times: ['25:00'] },
    { daysOfWeek: [] },
    { daysOfWeek: [1, 1] },
    { timeZone: 'invalid/zone' },
    { startsOn: '2026-02-30' },
    { startsOn: 'bad' },
    { end: { kind: 'onDate', date: '2026-03-06' } },
    { startsOn: '2026-03-07', daysOfWeek: [1], end: { kind: 'afterDays', days: 1 } },
    { overdueAfterMinutes: -1 },
    { reminderBeforeMinutes: 1441 },
  ])
    assert.equal(
      detailsSchema.safeParse({ ...details, schedule: { ...details.schedule, ...change } }).success,
      false,
    );
  assert.equal(detailsSchema.safeParse({ ...details, unknown: true }).success, false);
  assert.equal(
    rangeSchema.safeParse({ from: '2026-01-01T00:00:00Z', to: '2028-01-01T00:00:00Z' }).success,
    false,
  );
  assert.equal(doseStatusSchema.safeParse({ status: 'completed' }).success, false);
});
test('normalizes defaults and sorted time/day selections', () => {
  const schedule = { ...details.schedule, times: ['20:00', '08:00'], daysOfWeek: [5, 1] };
  delete schedule.reminderBeforeMinutes;
  delete schedule.overdueAfterMinutes;
  const value = detailsSchema.parse({ ...details, schedule });
  assert.deepEqual(value.schedule.times, ['08:00', '20:00']);
  assert.deepEqual(value.schedule.daysOfWeek, [1, 5]);
  assert.equal(value.schedule.overdueAfterMinutes, 30);
  assert.equal(value.schedule.reminderBeforeMinutes, null);
});
test('router requires authentication and current database membership before validating content', async () => {
  let allowed = true;
  const db = {
    transaction: (action) =>
      action({
        query: async (sql) => {
          if (sql.startsWith('SELECT id FROM circles')) return { rows: [{ id: 1 }] };
          if (sql.startsWith('SELECT 1 FROM circle_members')) return { rows: allowed ? [{}] : [] };
          throw new Error('A rejected request reached a medication query.');
        },
      }),
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.headers['x-test-user']) req.user = { id: req.headers['x-test-user'] };
    next();
  });
  app.use('/api/circles/:circleId', createMedicationRouter({ db }));
  app.use(errorHandler);
  await request(app).post('/api/circles/1/medications').send({}).expect(401);
  allowed = false;
  await request(app).post('/api/circles/1/medications').set('x-test-user', '1').send({}).expect(404);
  allowed = true;
  await request(app).post('/api/circles/1/medications').set('x-test-user', '1').send({}).expect(400);
  await request(app)
    .patch('/api/circles/1/medication-occurrences/dose_1_0')
    .set('x-test-user', '1')
    .send({ status: 'completed' })
    .expect(400);
});
