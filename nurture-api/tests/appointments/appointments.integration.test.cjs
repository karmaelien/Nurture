const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const connectionString = process.env.APPOINTMENT_TEST_DATABASE_URL;

test('appointment CRUD uses PostgreSQL and stays within its care circle', {
  skip: !connectionString && 'Set APPOINTMENT_TEST_DATABASE_URL to run against local PostgreSQL.',
}, async () => {
  const url = new URL(connectionString);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/nurture_appointments_test') {
    throw new Error('Use a local test database named nurture_appointments_test.');
  }
  const { Pool } = require('pg');
  const express = require('express');
  const request = require('supertest');
  const createAppointmentRouter = require('../../src/routes/appointments.routes');
  const errorHandler = require('../../src/middleware/errorHandler');
  const schema = `appointment_test_${process.pid}_${Date.now()}`;
  const admin = new Pool({ connectionString });
  const db = new Pool({ connectionString, options: `-c search_path=${schema},public` });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const file of [
      '1793158003573_init-schema.sql',
      '1794355200000_create-expenses.sql',
      '1794441600000_create-appointments.sql',
    ]) {
      const sql = fs.readFileSync(path.join(__dirname, '../../src/db/migrations', file), 'utf8');
      await db.query(sql.split('-- Down Migration')[0]);
    }
    const insert = async (sql, values = []) => String((await db.query(sql + ' RETURNING id', values)).rows[0].id);
    const member = await insert("INSERT INTO users(email,password_hash,username) VALUES ('member@test.invalid','unused','Member')");
    const outsider = await insert("INSERT INTO users(email,password_hash,username) VALUES ('other@test.invalid','unused','Other')");
    const circle = await insert("INSERT INTO circles(name,created_by) VALUES ('Test circle',$1)", [member]);
    const otherCircle = await insert("INSERT INTO circles(name,created_by) VALUES ('Other circle',$1)", [outsider]);
    await db.query("INSERT INTO circle_members(circle_id,user_id,display_name,role) VALUES ($1,$2,'Member','owner'),($3,$4,'Other','owner')",
      [circle, member, otherCircle, outsider]);
    const recipientId = await insert("INSERT INTO recipients(name,circle_id) VALUES ('Rose',$1)", [circle]);
    const foreignRecipient = await insert("INSERT INTO recipients(name,circle_id) VALUES ('Frank',$1)", [otherCircle]);

    const app = express();
    app.use(express.json());
    // Test identity stands in for the authentication middleware. The router still checks membership in PostgreSQL.
    app.use((req, res, next) => {
      if (req.headers['x-test-user']) req.user = { id: req.headers['x-test-user'] };
      next();
    });
    app.use('/api/circles/:circleId/appointments', createAppointmentRouter({ db }));
    app.use(errorHandler);
    const route = `/api/circles/${circle}/appointments`;
    const otherRoute = `/api/circles/${otherCircle}/appointments`;
    const auth = req => req.set('x-test-user', member);
    const filters = { from: '2026-11-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z', recipientId };
    const details = {
      recipientId, title: 'Checkup', startsAt: '2026-11-16T15:00:00.000Z',
      endsAt: '2026-11-16T16:00:00.000Z', location: null, assignedCaregiverId: member,
    };

    await request(app).get(route).query(filters).expect(401);
    await request(app).get(route).set('x-test-user', outsider).query(filters).expect(404);
    await auth(request(app).post(route)).send({ ...details, endsAt: details.startsAt }).expect(400);
    await auth(request(app).post(route)).send({ ...details, recipientId: foreignRecipient }).expect(404);
    await auth(request(app).post(route)).send({ ...details, assignedCaregiverId: outsider }).expect(404);
    const { appointment } = (await auth(request(app).post(route)).send(details).expect(201)).body;
    assert.deepEqual(appointment, { id: appointment.id, ...details, status: 'scheduled' });
    const item = `${route}/${appointment.id}`;
    await request(app).patch(`${otherRoute}/${appointment.id}`).set('x-test-user', outsider).send({ status: 'completed' }).expect(404);
    await request(app).patch(`${otherRoute}/${appointment.id}`).set('x-test-user', outsider).send({ invalid: true }).expect(404);
    await request(app).delete(`${otherRoute}/${appointment.id}`).set('x-test-user', outsider).expect(404);
    await auth(request(app).patch(item)).send({ status: 'completed' }).expect(200);
    const revised = { ...details, startsAt: details.endsAt, endsAt: '2026-11-16T17:00:00.000Z' };
    await auth(request(app).patch(item)).send(revised).expect(200);
    const { appointments } = (await auth(request(app).get(route)).query(filters).expect(200)).body;
    assert.deepEqual(appointments, [{ id: appointment.id, ...revised, status: 'completed' }]);
    const restored = await auth(request(app).patch(item)).send({ status: 'scheduled' }).expect(200);
    assert.equal(restored.body.appointment.status, 'scheduled');
    await auth(request(app).delete(item)).expect(204);
    await auth(request(app).patch(item)).send({ invalid: true }).expect(404);
    assert.deepEqual((await auth(request(app).get(route)).query(filters).expect(200)).body.appointments, []);
  } finally {
    await db.end();
    try {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await admin.end();
    }
  }
});
