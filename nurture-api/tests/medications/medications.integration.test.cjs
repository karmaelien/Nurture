const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
const connectionString = process.env.MEDICATION_TEST_DATABASE_URL || process.env.TEST_DATABASE_URL;

test(
  'PostgreSQL medication CRUD, schedules, history, access checks, and concurrent saves',
  {
    skip:
      !connectionString &&
      'Set MEDICATION_TEST_DATABASE_URL to a local test database to run PostgreSQL integration tests.',
  },
  async () => {
    const url = new URL(connectionString);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/test/i.test(decodeURIComponent(url.pathname)) ||
      connectionString === process.env.DATABASE_URL
    ) {
      throw new Error(
        'Use a separate local database whose name contains test; never the application DATABASE_URL.',
      );
    }
    const { Pool } = require('pg');
    const express = require('express');
    const request = require('supertest');
    const createMedicationRouter = require('../../src/routes/medications.routes');
    const errorHandler = require('../../src/middleware/errorHandler');
    const schema = `medication_test_${process.pid}_${Date.now()}`;
    const admin = new Pool({ connectionString });
    const db = new Pool({ connectionString, options: `-c search_path=${schema},public` });
    const migrationDir = path.join(__dirname, '../../src/db/migrations');
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      for (const file of fs
        .readdirSync(migrationDir)
        .filter((file) => file.endsWith('.sql'))
        .sort()) {
        await db.query(fs.readFileSync(path.join(migrationDir, file), 'utf8').split('-- Down Migration')[0]);
      }
      const insert = async (sql, values = []) =>
        String((await db.query(sql + ' RETURNING id', values)).rows[0].id);
      const owner = await insert(
        "INSERT INTO users(email,password_hash,username) VALUES ('owner@test.invalid','unused','Owner')",
      );
      const caregiver = await insert(
        "INSERT INTO users(email,password_hash,username) VALUES ('caregiver@test.invalid','unused','Caregiver')",
      );
      const outsider = await insert(
        "INSERT INTO users(email,password_hash,username) VALUES ('outsider@test.invalid','unused','Other')",
      );
      const circle = await insert("INSERT INTO circles(name,created_by) VALUES ('Test family',$1)", [owner]);
      const otherCircle = await insert("INSERT INTO circles(name,created_by) VALUES ('Other family',$1)", [
        outsider,
      ]);
      await db.query(
        "INSERT INTO circle_members(circle_id,user_id,display_name,role) VALUES ($1,$2,'Owner','owner'),($1,$3,'Caregiver','member'),($4,$5,'Other','owner')",
        [circle, owner, caregiver, otherCircle, outsider],
      );
      const recipientId = await insert("INSERT INTO recipients(name,circle_id) VALUES ('Rose',$1)", [circle]);
      const secondRecipient = await insert("INSERT INTO recipients(name,circle_id) VALUES ('Frank',$1)", [
        circle,
      ]);
      const foreignRecipient = await insert("INSERT INTO recipients(name,circle_id) VALUES ('Other',$1)", [
        otherCircle,
      ]);
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        if (req.headers['x-test-user']) req.user = { id: req.headers['x-test-user'] };
        next();
      });
      app.use('/api/circles/:circleId', createMedicationRouter({ db }));
      app.use(errorHandler);
      const route = `/api/circles/${circle}`;
      const auth = (req) => req.set('x-test-user', owner);
      const schedule = {
        times: ['08:00', '20:00'],
        timeZone: 'UTC',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startsOn: '2020-01-01',
        end: { kind: 'onDate', date: '2020-01-02' },
        overdueAfterMinutes: 30,
        reminderBeforeMinutes: 15,
      };
      const details = {
        recipientId,
        name: 'Sample',
        dosage: '1 tablet',
        schedule,
        assignedCaregiverId: caregiver,
      };
      const filters = { from: '2020-01-01T00:00:00Z', to: '2020-01-03T00:00:00Z' };
      const load = async () =>
        (
          await auth(request(app).get(`${route}/medication-occurrences`))
            .query(filters)
            .expect(200)
        ).body.medicationOccurrences;
      const overdue = async (person) =>
        (
          await auth(request(app).get(`${route}/medication-occurrences/overdue`))
            .query({ before: '2030-01-01T00:00:00Z', ...(person ? { recipientId: person } : {}) })
            .expect(200)
        ).body.medicationOccurrences;
      await request(app).get(`${route}/medications`).expect(401);
      await request(app).post(`${route}/medications`).set('x-test-user', outsider).send({}).expect(404);
      await auth(request(app).post(`${route}/medications`))
        .send({ ...details, schedule: { ...schedule, times: ['25:00'] } })
        .expect(400);
      await auth(request(app).post(`${route}/medications`))
        .send({ ...details, recipientId: foreignRecipient })
        .expect(404);
      await auth(request(app).post(`${route}/medications`))
        .send({ ...details, assignedCaregiverId: outsider })
        .expect(404);
      const { medication } = (
        await auth(request(app).post(`${route}/medications`))
          .send(details)
          .expect(201)
      ).body;
      assert.deepEqual(medication, { id: medication.id, version: 1, ...details });
      const item = `${route}/medications/${medication.id}`;
      let doses = await load();
      assert.equal(doses.length, 4);
      assert.deepEqual(await load(), doses);
      const doseRoute = `${route}/medication-occurrences/${doses[0].id}`;
      const taken = (
        await auth(request(app).patch(doseRoute))
          .send({ status: 'completed', version: doses[0].version })
          .expect(200)
      ).body.medicationOccurrence;
      assert.ok(taken.takenAt);
      assert.equal(taken.version, 2);
      const repeated = (
        await auth(request(app).patch(doseRoute))
          .send({ status: 'completed', version: taken.version })
          .expect(200)
      ).body.medicationOccurrence;
      assert.deepEqual(repeated, taken);
      const undone = (
        await auth(request(app).patch(doseRoute))
          .send({ status: 'pending', version: taken.version })
          .expect(200)
      ).body.medicationOccurrence;
      const latest = (
        await auth(request(app).patch(doseRoute))
          .send({ status: 'completed', version: undone.version })
          .expect(200)
      ).body.medicationOccurrence;
      await auth(request(app).patch(doseRoute))
        .send({ status: 'pending', version: taken.version })
        .expect(409);
      assert.deepEqual((await load())[0], latest);

      // Two different caregivers submit the same snapshot concurrently: exactly one succeeds.
      const parallel = await Promise.all(
        [owner, caregiver].map((user) =>
          request(app)
            .patch(`${route}/medication-occurrences/${doses[1].id}`)
            .set('x-test-user', user)
            .send({ status: 'completed', version: doses[1].version }),
        ),
      );
      assert.deepEqual(parallel.map((value) => value.status).sort(), [200, 409]);
      const edits = await Promise.all(
        ['2 tablets', '3 tablets'].map((dosage) =>
          auth(request(app).patch(item)).send({ ...details, dosage, version: 1 }),
        ),
      );
      assert.deepEqual(edits.map((value) => value.status).sort(), [200, 409]);
      let current = edits.find((value) => value.status === 200).body.medication;
      await auth(request(app).delete(item)).send({ version: 1 }).expect(409);
      // A stale dose version also fails when a schedule edit changes pending metadata.
      await auth(request(app).patch(`${route}/medication-occurrences/${doses[2].id}`))
        .send({ status: 'completed', version: doses[2].version })
        .expect(409);
      doses = await load();
      const stableVersions = doses.map((dose) => dose.version);
      assert.deepEqual(
        (await load()).map((dose) => dose.version),
        stableVersions,
      );
      await request(app)
        .patch(`/api/circles/${otherCircle}/medication-occurrences/${doses[0].id}`)
        .set('x-test-user', outsider)
        .send({ status: 'pending', version: latest.version })
        .expect(404);
      assert.deepEqual(await overdue(secondRecipient), []);
      await auth(request(app).get(`${route}/medication-occurrences`))
        .query({ ...filters, recipientId: foreignRecipient })
        .expect(404);

      // Removed schedule times retain completed snapshots and reject an undo that would erase them.
      current = (
        await auth(request(app).patch(item))
          .send({ ...details, version: current.version, schedule: { ...schedule, times: ['09:00'] } })
          .expect(200)
      ).body.medication;
      const failedUndo = await auth(request(app).patch(doseRoute))
        .send({ status: 'pending', version: latest.version })
        .expect(409);
      assert.equal(failedUndo.body.error.code, 'schedule_conflict');
      assert.deepEqual(
        (await load()).find((dose) => dose.id === latest.id),
        latest,
      );

      // Backfill never-viewed days, then remove obsolete pending rows after shortening/moving a course.
      const backfill = (
        await auth(request(app).post(`${route}/medications`))
          .send({
            ...details,
            name: 'Backfill',
            assignedCaregiverId: null,
            schedule: { ...schedule, times: ['08:00'], end: { kind: 'onDate', date: '2020-01-03' } },
          })
          .expect(201)
      ).body.medication;
      const backfillItem = `${route}/medications/${backfill.id}`;
      const firstBacklog = (await overdue()).filter((dose) => dose.medicationId === backfill.id);
      assert.equal(firstBacklog.length, 3);
      assert.deepEqual(
        (await overdue()).filter((dose) => dose.medicationId === backfill.id),
        firstBacklog,
      );
      let changed = (
        await auth(request(app).patch(backfillItem))
          .send({
            ...details,
            name: 'Backfill',
            version: 1,
            assignedCaregiverId: null,
            schedule: { ...schedule, times: ['08:00'], end: { kind: 'onDate', date: '2020-01-01' } },
          })
          .expect(200)
      ).body.medication;
      assert.equal((await overdue()).filter((dose) => dose.medicationId === backfill.id).length, 1);
      changed = (
        await auth(request(app).patch(backfillItem))
          .send({
            ...details,
            name: 'Backfill',
            version: changed.version,
            assignedCaregiverId: null,
            schedule: {
              ...schedule,
              times: ['08:00'],
              startsOn: '2020-01-03',
              end: { kind: 'onDate', date: '2020-01-03' },
            },
          })
          .expect(200)
      ).body.medication;
      const moved = (await overdue()).filter((dose) => dose.medicationId === backfill.id);
      assert.equal(moved.length, 1);
      assert.equal(moved[0].scheduledAt, '2020-01-03T08:00:00.000Z');

      // A caregiver with an already-open page loses both reads and writes after removal.
      await db.query('DELETE FROM circle_members WHERE circle_id=$1 AND user_id=$2', [circle, caregiver]);
      await request(app).get(`${route}/medications`).set('x-test-user', caregiver).expect(404);
      await request(app)
        .patch(doseRoute)
        .set('x-test-user', caregiver)
        .send({ status: 'pending', version: latest.version })
        .expect(404);
      await auth(request(app).delete(item)).send({ version: current.version }).expect(204);
      assert.ok(!(await load()).some((dose) => dose.medicationId === medication.id));
      await auth(request(app).delete(item)).send({ version: current.version }).expect(404);
      await auth(request(app).delete(backfillItem)).send({ version: changed.version }).expect(204);
      const migration = fs.readFileSync(
        path.join(migrationDir, '1795478400000_create-medications.sql'),
        'utf8',
      );
      await db.query(migration.split('-- Down Migration')[1]);
      assert.equal(
        (await db.query("SELECT to_regclass('medications') AS table_name")).rows[0].table_name,
        null,
      );
    } finally {
      await db.end();
      try {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await admin.end();
      }
    }
  },
);
