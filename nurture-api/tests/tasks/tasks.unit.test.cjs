const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createSchema,
  updateSchema,
  listSchema,
} = require('../../src/validators/tasks.validators');
const schedule = require('../../src/services/task-schedule');
const client = require('../../../client/src/features/tasks/task-recurrence.ts');
const definition = {
  id: '1',
  circleId: '2',
  recipientId: '3',
  assignedCaregiverId: null,
  title: 'Sample',
  version: 1,
  startsOn: '2026-03-07',
  time: '08:00',
  createdAt: '2026-03-06T00:00:00Z',
  stoppedAt: null,
  recurrence: {
    unit: 'days',
    interval: 1,
    daysOfWeek: [],
    timeZone: 'America/New_York',
    end: { kind: 'afterOccurrences', count: 4 },
  },
};

test('server and browser task generators agree across DST, weekly intervals, and count/date limits', () => {
  for (const rule of [
    definition.recurrence,
    {
      ...definition.recurrence,
      unit: 'weeks',
      interval: 2,
      daysOfWeek: [0, 1, 4, 6],
    },
    { ...definition.recurrence, end: { kind: 'onDate', date: '2026-03-10' } },
    { ...definition.recurrence, timeZone: 'Pacific/Auckland' },
  ]) {
    const series = { ...definition, recurrence: rule };
    assert.deepEqual(
      schedule.firstTaskOccurrence(series),
      client.firstTaskOccurrence(series),
    );
    assert.equal(schedule.lastTaskDate(series), client.lastTaskDate(series));
    for (let day = 0; day < 60; day++) {
      const date = schedule.nextTaskDate(series.startsOn, day);
      assert.deepEqual(
        schedule.taskOccurrence(series, date),
        client.taskOccurrence(series, date),
      );
    }
  }
  assert.equal(
    schedule.taskOccurrence(definition, '2026-03-07').dueAt,
    '2026-03-07T13:00:00.000Z',
  );
  assert.equal(
    schedule.taskOccurrence(definition, '2026-03-08').dueAt,
    '2026-03-08T12:00:00.000Z',
  );
});

test('bounded task history progresses and does not invent pre-creation occurrences', () => {
  const series = {
    ...definition,
    startsOn: '2020-01-01',
    createdAt: '2020-01-01T00:00:00Z',
    recurrence: { ...definition.recurrence, end: { kind: 'never' } },
  };
  const store = { taskSeries: [series], care: { tasks: [] } };
  assert.equal(
    schedule.materializeTaskSeries(
      store,
      '2',
      undefined,
      '2026-12-01T00:00:00Z',
    ),
    true,
  );
  assert.equal(store.care.tasks.length, 366);
  const through = series.through;
  schedule.materializeTaskSeries(store, '2', undefined, '2026-12-01T00:00:00Z');
  assert.ok(series.through > through);
  assert.equal(
    schedule.taskOccurrence(
      { ...definition, createdAt: '2026-03-08T00:00:00Z' },
      '2026-03-07',
    ),
    null,
  );
});

test('task validation keeps create, occurrence edits, date filters, and versions strict', () => {
  const input = {
    recipientId: '3',
    title: ' Sample ',
    dueAt: null,
    assignedCaregiverId: null,
  };
  assert.equal(createSchema.parse(input).title, 'Sample');
  for (const change of [
    { recipientId: '0' },
    { title: ' ' },
    { dueAt: '2026-02-30T12:00:00Z' },
    { version: 1 },
    { recurrence: definition.recurrence },
  ])
    assert.equal(
      createSchema.safeParse({ ...input, ...change }).success,
      false,
    );
  assert.equal(
    updateSchema.safeParse({ status: 'completed', version: 1 }).success,
    true,
  );
  assert.equal(
    updateSchema.safeParse({
      ...input,
      version: 1,
      recurrence: definition.recurrence,
    }).success,
    false,
  );
  assert.equal(listSchema.safeParse({ includeUndated: 'true' }).success, true);
  for (const query of [
    { includeUndated: 'maybe' },
    { recipientId: ['3', '4'] },
    { status: 'pending', completedFrom: '2026-01-01T00:00:00Z' },
    { dueFrom: '2026-02-01T00:00:00Z', dueBefore: '2026-01-01T00:00:00Z' },
  ])
    assert.equal(listSchema.safeParse(query).success, false);
});
