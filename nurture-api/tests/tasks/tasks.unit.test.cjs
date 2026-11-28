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

test('browser and server merge viewed ranges, migrate legacy cursors, and cap disjoint coverage without losing progress', () => {
  const makeStore = () => ({
    taskSeries: [
      {
        ...definition,
        startsOn: '2020-01-01',
        createdAt: '2019-12-31T00:00:00Z',
        recurrence: {
          ...definition.recurrence,
          timeZone: 'UTC',
          end: { kind: 'never' },
        },
      },
    ],
    care: { tasks: [] },
    deletedTaskOccurrences: [],
  });
  const serverStore = makeStore();
  const browserStore = makeStore();
  function run(from, to) {
    const pending = schedule.materializeTaskSeries(serverStore, '2', from, to);
    assert.equal(
      client.materializeTaskSeries(browserStore, '2', from, to),
      pending,
    );
    assert.deepEqual(browserStore, serverStore);
    assert.ok(serverStore.taskSeries[0].coverage.length <= 64);
    assert.equal(serverStore.taskSeries[0].ranges, undefined);
    return pending;
  }
  const instant = (date) => `${date}T00:00:00Z`;
  for (let index = 0; index < 100; index++) {
    const date = schedule.nextTaskDate('2026-01-01', index);
    run(instant(date), instant(schedule.nextTaskDate(date, 1)));
  }
  assert.equal(serverStore.taskSeries[0].coverage.length, 1);
  // Migrate an unfinished legacy range, retaining its already-scanned prefix.
  for (const store of [serverStore, browserStore]) {
    store.taskSeries[0].ranges = {
      '2020-01-01T00:00:00Z|2030-01-01T00:00:00Z': '2021-01-01',
    };
  }
  assert.equal(run('2020-01-01T00:00:00Z', '2030-01-01T00:00:00Z'), true);
  assert.ok(
    serverStore.care.tasks.some((task) => task.dueAt.startsWith('2021-01-01')),
  );
  for (let index = 0; index < 80; index++) {
    const date = schedule.nextTaskDate('2050-01-01', index * 40);
    run(instant(date), instant(schedule.nextTaskDate(date, 1)));
  }
  // Even an old, unfinished range must keep progressing when coverage is full.
  let batches = 0;
  while (run('2020-01-01T00:00:00Z', '2030-01-01T00:00:00Z')) {
    assert.ok(++batches < 15);
  }
  assert.equal(
    new Set(serverStore.care.tasks.map((task) => task.id)).size,
    serverStore.care.tasks.length,
  );
  for (const store of [serverStore, browserStore]) {
    store.care.tasks.find((task) => task.id === '1:2020-01-01').title =
      'Individual edit';
    store.care.tasks = store.care.tasks.filter(
      (task) => task.id !== '1:2020-01-02',
    );
    store.deletedTaskOccurrences.push('1:2020-01-02');
  }
  // Evict historical coverage and revisit it: saved edits and deletion exceptions win.
  for (let index = 0; index < 80; index++) {
    const date = schedule.nextTaskDate('2070-01-01', index * 40);
    run(instant(date), instant(schedule.nextTaskDate(date, 1)));
  }
  run('2020-01-01T00:00:00Z', '2020-01-04T00:00:00Z');
  assert.equal(
    serverStore.care.tasks.find((task) => task.id === '1:2020-01-01').title,
    'Individual edit',
  );
  assert.equal(
    serverStore.care.tasks.some((task) => task.id === '1:2020-01-02'),
    false,
  );
});
