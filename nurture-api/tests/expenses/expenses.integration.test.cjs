const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const express = require('express');
const request = require('supertest');
const createExpenseRouter = require('../../src/routes/expenses.routes');
const errorHandler = require('../../src/middleware/errorHandler');

const connectionString = process.env.EXPENSE_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set EXPENSE_TEST_DATABASE_URL to a local nurture_expenses_test database.');
const url = new URL(connectionString);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/nurture_expenses_test') {
  throw new Error('Expense tests only run against a local database named nurture_expenses_test.');
}
const schema = `expense_test_${process.pid}_${Date.now()}`;
const admin = new Pool({ connectionString });
const db = new Pool({ connectionString, options: `-c search_path=${schema},public` });
const app = express();
app.use(express.json());
let userId, outsiderId, circleId, otherCircleId, recipientId, secondRecipientId, foreignRecipientId;
// Test-only identity, deliberately outside production code. Real membership checks still run.
app.use((req, res, next) => {
  if (req.headers['x-test-user']) req.user = { id: req.headers['x-test-user'] };
  next();
});
app.use('/api/circles/:circleId/expenses', createExpenseRouter({ db }));
app.use(errorHandler);
const migrationPath = path.join(__dirname, '../../src/db/migrations');
const expenseSql = fs.readFileSync(path.join(migrationPath, '1794355200000_create-expenses.sql'), 'utf8');
const up = sql => sql.split('-- Down Migration')[0].replace('-- Up Migration', '');
const insert = async (sql, values = []) => String((await db.query(sql + ' RETURNING id', values)).rows[0].id);
const body = (overrides = {}) => ({ recipientId, description: 'Pharmacy', category: 'medication', amountCents: 1250, currency: 'USD', incurredOn: '2026-11-10', ...overrides });
const route = () => `/api/circles/${circleId}/expenses`;
const query = { fromDate: '2026-11-01', toDate: '2026-12-01' };
const auth = req => req.set('x-test-user', userId);
const create = async (overrides = {}) => (await auth(request(app).post(route())).send(body(overrides)).expect(201)).body.expense;

before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  // Apply only the up sections; the teammate's existing down migration is not used.
  await db.query(up(fs.readFileSync(path.join(migrationPath, '1793158003573_init-schema.sql'), 'utf8')));
  await db.query(up(expenseSql));
  userId = await insert("INSERT INTO users(email,password_hash,username) VALUES ('member@test.invalid','unused','Member')");
  outsiderId = await insert("INSERT INTO users(email,password_hash,username) VALUES ('outsider@test.invalid','unused','Outsider')");
  circleId = await insert("INSERT INTO circles(name,created_by) VALUES ('Test circle',$1)", [userId]);
  otherCircleId = await insert("INSERT INTO circles(name,created_by) VALUES ('Other circle',$1)", [outsiderId]);
  await db.query("INSERT INTO circle_members(circle_id,user_id,display_name,role) VALUES ($1,$2,'Member','member'),($3,$4,'Outsider','owner')", [circleId, userId, otherCircleId, outsiderId]);
  recipientId = await insert("INSERT INTO recipients(name,circle_id) VALUES ('Rose',$1)", [circleId]);
  secondRecipientId = await insert("INSERT INTO recipients(name,circle_id) VALUES ('Frank',$1)", [circleId]);
  foreignRecipientId = await insert("INSERT INTO recipients(name,circle_id) VALUES ('Other',$1)", [otherCircleId]);
});
beforeEach(async () => { await db.query('DELETE FROM expenses'); });
after(async () => {
  await db.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});

test('CRUD persists data, serializes dates/IDs/cents, and preserves omitted fields', async () => {
  const expense = await create({ description: '  Pharmacy  ' });
  assert.deepEqual(expense, { ...body(), id: expense.id });
  assert.equal(typeof expense.id, 'string');
  const updated = await auth(request(app).patch(`${route()}/${expense.id}`)).send({ amountCents: 2450 }).expect(200);
  assert.deepEqual(updated.body.expense, { ...expense, amountCents: 2450 });
  const result = await auth(request(app).get(route())).query(query).expect(200);
  assert.deepEqual(result.body.expenses, [updated.body.expense]);
  assert.equal((await db.query('SELECT amount_cents FROM expenses WHERE id=$1', [expense.id])).rows[0].amount_cents, '2450');
  await auth(request(app).delete(`${route()}/${expense.id}`)).expect(204);
  await auth(request(app).delete(`${route()}/${expense.id}`)).expect(404);
  assert.deepEqual((await auth(request(app).get(route())).query(query)).body, { expenses: [] });
});

test('date bounds, category and recipient combine; date sorting and tie breaks are stable', async () => {
  await create({ incurredOn: '2026-10-31' });
  const start = await create({ incurredOn: '2026-11-01' });
  const latest = await create({ incurredOn: '2026-11-30' });
  const tied = await create({ incurredOn: '2026-11-30' });
  await create({ incurredOn: '2026-12-01' });
  await create({ category: 'other' });
  await create({ recipientId: secondRecipientId });
  const response = await auth(request(app).get(route())).query({ ...query, category: 'medication', recipientId }).expect(200);
  assert.deepEqual(response.body.expenses.map(e => e.id), [latest.id, tied.id, start.id]);
});

test('all routes require authentication', async () => {
  const expense = await create();
  await request(app).get(route()).query(query).expect(401);
  await request(app).post(route()).send(body()).expect(401);
  await request(app).patch(`${route()}/${expense.id}`).send({ amountCents: 1 }).expect(401);
  await request(app).delete(`${route()}/${expense.id}`).expect(401);
});

test('non-members get 404 before body/filter validation', async () => {
  for (const method of ['get', 'post', 'patch', 'delete']) {
    const suffix = ['patch', 'delete'].includes(method) ? '/123' : '';
    const response = await request(app)[method](route() + suffix).set('x-test-user', outsiderId).send({ invalid: true }).expect(404);
    assert.equal(response.body.error.code, 'not_found');
  }
});

test('cross-circle recipients and expenses cannot be read or modified', async () => {
  await auth(request(app).post(route())).send(body({ recipientId: foreignRecipientId })).expect(404);
  await auth(request(app).get(route())).query({ ...query, recipientId: foreignRecipientId }).expect(404);
  const expense = await create();
  await auth(request(app).patch(`${route()}/${expense.id}`)).send({ recipientId: foreignRecipientId }).expect(404);
  const foreign = await request(app).post(`/api/circles/${otherCircleId}/expenses`).set('x-test-user', outsiderId).send(body({ recipientId: foreignRecipientId })).expect(201);
  await auth(request(app).patch(`${route()}/${foreign.body.expense.id}`)).send({ bad: true }).expect(404);
  await auth(request(app).delete(`${route()}/${foreign.body.expense.id}`)).expect(404);
  assert.equal((await auth(request(app).get(route())).query(query)).body.expenses.length, 1);
});

test('invalid writes leave persisted data unchanged', async () => {
  const expense = await create();
  for (const patch of [{}, { amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.2 }, { amountCents: Number.MAX_SAFE_INTEGER + 1 }, { amountCents: '100' }, { description: ' ' }, { description: 'x'.repeat(201) }, { description: null }, { currency: 'EUR' }, { category: 'unknown' }, { incurredOn: '2026-02-30' }, { id: '99' }]) {
    const response = await auth(request(app).patch(`${route()}/${expense.id}`)).send(patch).expect(400);
    assert.equal(response.body.error.code, 'validation_error');
  }
  await auth(request(app).post(route())).send({ description: 'Incomplete' }).expect(400);
  assert.deepEqual((await auth(request(app).get(route())).query(query)).body.expenses, [expense]);
});

test('invalid filters fail clearly', async () => {
  for (const filters of [{}, { ...query, fromDate: 'bad' }, { ...query, toDate: query.fromDate }, { ...query, category: 'unknown' }, { ...query, unsupported: 'yes' }, { ...query, recipientId: '' }]) {
    await auth(request(app).get(route())).query(filters).expect(400);
  }
  await auth(request(app).get(route())).query({ ...query, recipientId: 'nonexistent' }).expect(404);
  await auth(request(app).get('/api/circles/999999999999999999999/expenses')).query(query).expect(404);
});

test('recipient changes within the same circle and maximum safe cents round-trip', async () => {
  const expense = await create({ amountCents: Number.MAX_SAFE_INTEGER });
  assert.equal(expense.amountCents, Number.MAX_SAFE_INTEGER);
  const response = await auth(request(app).patch(`${route()}/${expense.id}`)).send({ recipientId: secondRecipientId }).expect(200);
  assert.equal(response.body.expense.recipientId, secondRecipientId);
});

test('simultaneous creates and disjoint updates do not overwrite each other', async () => {
  const created = await Promise.all([create(), create({ description: 'Transport' })]);
  assert.notEqual(created[0].id, created[1].id);
  const target = `${route()}/${created[0].id}`;
  await Promise.all([
    auth(request(app).patch(target)).send({ description: 'Updated' }).expect(200),
    auth(request(app).patch(target)).send({ amountCents: 2500 }).expect(200),
  ]);
  const expenses = (await auth(request(app).get(route())).query(query)).body.expenses;
  assert.equal(expenses.length, 2);
  assert.deepEqual(expenses.find(e => e.id === created[0].id), { ...created[0], description: 'Updated', amountCents: 2500 });
});

test('database constraints reject cross-circle records and invalid cents even without HTTP', async () => {
  const sql = "INSERT INTO expenses(circle_id,recipient_id,description,category,amount_cents,currency,incurred_on) VALUES ($1,$2,'Test','other',$3,'USD','2026-11-10')";
  await assert.rejects(db.query(sql, [circleId, foreignRecipientId, 100]), { code: '23503' });
  await assert.rejects(db.query(sql, [circleId, recipientId, 0]), { code: '23514' });
});

test('expense migration rolls back and reapplies without changing shared tables', async () => {
  await db.query(expenseSql.split('-- Down Migration')[1]);
  assert.equal((await db.query('SELECT count(*) FROM recipients')).rows[0].count, '3');
  await db.query(up(expenseSql));
  await create();
});
