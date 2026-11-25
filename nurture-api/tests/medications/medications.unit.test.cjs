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
const {
  doseInstant,
  generateMedicationDoses,
  generateEffectiveDoses,
  medicationHistoryBounds,
} = require('../../src/services/medication-schedule');

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

test('recreated times and different care profiles have distinct dose identities', () => {
  const from = '2026-03-07T00:00:00Z',
    to = '2026-03-08T00:00:00Z';
  const original = generateMedicationDoses(definition, from, to)[0];
  const recreated = generateMedicationDoses({ ...definition, version: 3, dosage: '2 tablets' }, from, to)[0];
  const moved = generateMedicationDoses({ ...definition, version: 2, recipientId: '3' }, from, to)[0];
  assert.notEqual(original.id, recreated.id);
  assert.notEqual(original.id, moved.id);
  assert.equal(original.version, recreated.version);
});

test('schedule edits use the old schedule before the edit, even for never-viewed days', () => {
  const edited = { ...definition, version: 2, schedule: { ...definition.schedule, times: ['09:00'] } };
  const revisions = [{ definition, from: null, to: '2026-03-08T15:00:00Z' }];
  const doses = generateEffectiveDoses(edited, '2026-03-07T00:00:00Z', '2026-03-10T00:00:00Z', revisions);
  assert.deepEqual(
    doses.map((dose) => dose.scheduledAt),
    ['2026-03-07T13:00:00.000Z', '2026-03-08T12:00:00.000Z', '2026-03-09T13:00:00.000Z'],
  );
});

test('metadata edits preserve historical dosage and follow an exact UTC boundary', () => {
  const boundary = '2026-03-08T12:00:00.000Z';
  const edited = {
    ...definition,
    version: 2,
    name: 'Renamed',
    dosage: '2 tablets',
    schedule: { ...definition.schedule, overdueAfterMinutes: 1440 },
  };
  const revisions = [{ definition, from: null, to: boundary }];
  const doses = generateEffectiveDoses(edited, '2026-03-07T00:00:00Z', '2026-03-10T00:00:00Z', revisions);
  assert.equal(doses[0].dosage, '1 tablet');
  assert.equal(doses[0].overdueAfterMinutes, 30);
  assert.equal(doses[1].scheduledAt, boundary);
  assert.equal(doses[1].dosage, '2 tablets');
  assert.equal(
    medicationHistoryBounds(edited, '2026-03-10T00:00:00Z', revisions).lower,
    medicationHistoryBounds(definition, '2026-03-10T00:00:00Z').lower,
  );
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

test('dose status routes save taken and pending, reject stale actions, and recheck access', async () => {
  const scheduled = generateMedicationDoses(definition, '2026-03-07T00:00:00Z', '2026-03-08T00:00:00Z')[0];
  let dose = { ...scheduled, scheduledAt: new Date(scheduled.scheduledAt), takenAt: null };
  let allowed = true;
  const queries = [];
  const db = {
    transaction: (action) =>
      action({
        query: async (sql, values = []) => {
          queries.push(sql);
          if (sql.includes('FROM circle_members')) return { rows: allowed ? [{}] : [] };
          if (sql.startsWith('SELECT medication_id')) return { rows: dose ? [{ id: '1' }] : [] };
          if (sql.includes('FROM medications'))
            return { rows: [{ ...definition, effective_from: new Date('2026-03-08T00:00:00Z') }] };
          if (sql.includes('FROM medication_revisions'))
            return {
              rows: [{ definition, effective_from: null, effective_to: new Date('2026-03-08T00:00:00Z') }],
            };
          if (sql.startsWith('UPDATE medication_occurrences SET status')) {
            assert.equal(values[3], dose.version);
            dose = {
              ...dose,
              status: values[2],
              version: dose.version + 1,
              takenAt: values[2] === 'completed' ? new Date('2026-03-09T12:00:00Z') : null,
            };
            return { rows: [dose] };
          }
          if (sql.includes('FROM medication_occurrences')) return { rows: dose ? [dose] : [] };
          throw new Error(`Unexpected query: ${sql}`);
        },
      }),
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: '1' };
    next();
  });
  app.use('/api/circles/:circleId', createMedicationRouter({ db }));
  app.use(errorHandler);
  const path = `/api/circles/1/medication-occurrences/${dose.id}`;
  const completed = await request(app).patch(path).send({ status: 'completed', version: 1 }).expect(200);
  assert.equal(completed.body.medicationOccurrence.status, 'completed');
  assert.ok(completed.body.medicationOccurrence.takenAt);
  const parentLock = queries.findIndex(
    (sql) => sql.includes('FROM medications') && sql.includes('FOR UPDATE'),
  );
  const doseLock = queries.findIndex(
    (sql) => sql.includes('FROM medication_occurrences') && sql.includes('FOR UPDATE'),
  );
  assert.ok(parentLock >= 0 && doseLock > parentLock);
  await request(app).patch(path).send({ status: 'pending', version: 1 }).expect(409);
  assert.equal(dose.status, 'completed');
  const pending = await request(app).patch(path).send({ status: 'pending', version: 2 }).expect(200);
  assert.equal(pending.body.medicationOccurrence.status, 'pending');
  assert.equal(pending.body.medicationOccurrence.takenAt, null);
  assert.equal(pending.body.medicationOccurrence.dosage, scheduled.dosage);
  allowed = false;
  await request(app).patch(path).send({ status: 'completed', version: 3 }).expect(404);
  assert.equal(dose.status, 'pending');
  allowed = true;
  dose = null;
  await request(app).patch(path).send({ status: 'completed', version: 3 }).expect(404);
});

function scopedDatabase() {
  const transactions = [];
  let allowed = true;
  const definitions = [1, 2].map((id) => ({
    ...definition,
    id: String(id),
    schedule: { ...definition.schedule, startsOn: '2099-01-01', end: { kind: 'never' } },
  }));
  const db = {
    transaction: async (action) => {
      const queries = [],
        locked = new Set();
      const result = await action({
        query: async (sql, values = []) => {
          queries.push(sql);
          if (sql.includes('FROM circle_members')) return { rows: allowed ? [{}] : [] };
          if (sql.includes('FROM medications')) {
            if (sql.includes('FOR UPDATE')) {
              locked.add(values[1]);
              return { rows: definitions.filter((item) => item.id === values[1]) };
            }
            return { rows: definitions };
          }
          if (sql.includes('FROM medication_revisions')) return { rows: [] };
          if (sql.startsWith('DELETE FROM medication_occurrences')) return { rows: [], rowCount: 0 };
          if (sql.includes('FROM medication_occurrences')) return { rows: [] };
          throw new Error(`Unexpected query: ${sql}`);
        },
      });
      transactions.push({ queries, locked });
      if (locked.size && db.revokeAfterGeneration) allowed = false;
      return result;
    },
  };
  return { db, transactions };
}

test('plain medication listings take no exclusive family or medication lock', async () => {
  const { db, transactions } = scopedDatabase();
  const model = require('../../src/models/medication.model')(db);
  assert.equal((await model.run('1', '1', (operations) => operations.list())).length, 2);
  assert.ok(transactions.flatMap((tx) => tx.queries).every((sql) => !sql.includes('FOR UPDATE')));
  assert.ok(transactions.flatMap((tx) => tx.queries).every((sql) => !sql.includes('FROM circles')));
});

test('a family dose read commits each medication independently instead of holding every parent lock', async () => {
  const { db, transactions } = scopedDatabase();
  const model = require('../../src/models/medication.model')(db);
  await model.run('1', '1', (operations) =>
    operations.occurrences({ from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' }),
  );
  const generation = transactions.filter((tx) => tx.locked.size);
  assert.equal(generation.length, 2);
  assert.deepEqual(
    generation.map((tx) => [...tx.locked]),
    [['1'], ['2']],
  );
});

test('access removed between medication batches prevents the collection response', async () => {
  const { db } = scopedDatabase();
  db.revokeAfterGeneration = true;
  const model = require('../../src/models/medication.model')(db);
  await assert.rejects(
    model.run('1', '1', (operations) =>
      operations.occurrences({ from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' }),
    ),
    (error) => error.status === 404,
  );
});

test('overdue pages combine independently read medications without skipping or repeating rows', async () => {
  const now = new Date('2100-01-01T00:00:00Z');
  const definitions = ['1', '2'].map((id) => ({
    ...definition,
    id,
    history_version: 1,
    history_through: now,
    schedule: { ...definition.schedule, startsOn: '2099-01-01', end: { kind: 'never' } },
  }));
  const rows = Object.fromEntries(
    definitions.map((item) => [
      item.id,
      Array.from({ length: 180 }, (_, index) => ({
        id: `dose_${item.id}_${String(index).padStart(3, '0')}`,
        medicationId: item.id,
        scheduledAt: new Date('2099-12-31T08:00:00Z'),
        status: 'pending',
        version: 1,
      })),
    ]),
  );
  const db = {
    transaction: (action) =>
      action({
        query: async (sql, values = []) => {
          if (sql.includes('FROM circle_members')) return { rows: [{}] };
          if (sql.includes('clock_timestamp()')) return { rows: [{ now }] };
          if (sql.includes('FROM medication_revisions')) return { rows: [] };
          if (sql.startsWith('UPDATE medications SET history_version')) return { rows: [] };
          if (sql.startsWith('SELECT count(*)')) return { rows: [{ count: rows[values[4]].length }] };
          if (sql.includes('FROM medication_occurrences')) {
            const selected = rows[values[6]].filter(
              (row) =>
                !values[4] ||
                row.scheduledAt.getTime() > Date.parse(values[4]) ||
                (row.scheduledAt.getTime() === Date.parse(values[4]) && row.id > values[5]),
            );
            return { rows: selected.slice(0, 101) };
          }
          if (sql.includes('FROM medications'))
            return {
              rows: sql.includes('FOR UPDATE')
                ? definitions.filter((item) => item.id === values[1])
                : definitions,
            };
          throw new Error(`Unexpected query: ${sql}`);
        },
      }),
  };
  const model = require('../../src/models/medication.model')(db);
  const seen = [];
  let cursor;
  do {
    const page = await model.run('1', '1', (operations) =>
      operations.overdue({ before: now.toISOString(), cursor }),
    );
    assert.equal(page.totalOverdueCount, 360);
    assert.ok(page.medicationOccurrences.length <= 100);
    seen.push(...page.medicationOccurrences.map((row) => row.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(seen.length, 360);
  assert.equal(new Set(seen).size, 360);
  assert.deepEqual(seen, [...seen].sort());
});
