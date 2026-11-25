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
      assert.deepEqual(medication, { id: medication.id, version: 1, stoppedAt: null, ...details });
      const createdBoundary = (
        await db.query('SELECT effective_from FROM medications WHERE id=$1', [medication.id])
      ).rows[0].effective_from;
      assert.ok(createdBoundary instanceof Date);
      assert.deepEqual(await load(), []);
      assert.deepEqual(
        (await overdue()).filter((dose) => dose.medicationId === medication.id),
        [],
      );
      // The remaining CRUD/history scenarios model a course already tracked in 2020.
      const trackFrom = (id, from) =>
        db.query(
          'UPDATE medications SET effective_from=$2, history_through=NULL, history_version=NULL WHERE id=$1',
          [id, from],
        );
      await trackFrom(medication.id, '2019-12-31T00:00:00Z');
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
      // Historical doses retain their original version/details after an unrelated medication edit.
      await auth(request(app).patch(`${route}/medication-occurrences/${doses[2].id}`))
        .send({ status: 'completed', version: doses[2].version })
        .expect(200);
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

      // A schedule edit changes only future doses; historical pending/taken rows stay intact.
      const historicalBefore = await load();
      current = (
        await auth(request(app).patch(item))
          .send({ ...details, version: current.version, schedule: { ...schedule, times: ['09:00'] } })
          .expect(200)
      ).body.medication;
      assert.deepEqual(await load(), historicalBefore);
      const undoneHistory = (
        await auth(request(app).patch(doseRoute))
          .send({ status: 'pending', version: latest.version })
          .expect(200)
      ).body.medicationOccurrence;
      assert.equal(undoneHistory.dosage, details.dosage);
      assert.deepEqual(
        (await load()).find((dose) => dose.id === latest.id),
        undoneHistory,
      );

      // Backfill never-viewed days; later course edits must not erase those past missed doses.
      let backfill = (
        await auth(request(app).post(`${route}/medications`))
          .send({
            ...details,
            name: 'Backfill',
            assignedCaregiverId: null,
            schedule: { ...schedule, times: ['08:00'], end: { kind: 'onDate', date: '2020-01-03' } },
          })
          .expect(201)
      ).body.medication;
      let backfillItem = `${route}/medications/${backfill.id}`;
      // A generation request blocked on one medication must not block an edit to another.
      const blocker = await db.connect();
      let waiting;
      try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT id FROM medications WHERE id=$1 FOR UPDATE', [medication.id]);
        waiting = auth(request(app).get(`${route}/medication-occurrences`))
          .query(filters)
          .then((response) => response);
        const deadline = Date.now() + 3000;
        let blocked = false;
        while (!blocked && Date.now() < deadline) {
          blocked =
            (
              await admin.query(
                "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%effective_from%FOR UPDATE%'",
              )
            ).rowCount > 0;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 25));
        }
        assert.equal(blocked, true, 'The read should be waiting for the explicitly blocked medication.');
        await auth(request(app).get(`${route}/medications`))
          .timeout({ response: 1500, deadline: 2500 })
          .expect(200);
        // Deletion of another medication can complete while this read waits.
        await auth(request(app).delete(backfillItem))
          .send({ version: backfill.version })
          .timeout({ response: 1500, deadline: 2500 })
          .expect(204);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        if (waiting) assert.equal((await waiting).status, 200);
      }
      // Recreate the backfill fixture after the independent-delete assertion.
      backfill = (
        await auth(request(app).post(`${route}/medications`))
          .send({
            ...details,
            name: 'Backfill',
            assignedCaregiverId: null,
            schedule: { ...schedule, times: ['08:00'], end: { kind: 'onDate', date: '2020-01-03' } },
          })
          .expect(201)
      ).body.medication;
      backfillItem = `${route}/medications/${backfill.id}`;
      await trackFrom(backfill.id, '2019-12-31T00:00:00Z');
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
      assert.deepEqual(
        (await overdue()).filter((dose) => dose.medicationId === backfill.id),
        firstBacklog,
      );
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
      assert.deepEqual(moved, firstBacklog);

      // A removed/restored time must not recreate a stale tab's ID/version combination.
      const futureDetails = {
        ...details,
        schedule: { ...schedule, startsOn: '2099-01-01', end: { kind: 'onDate', date: '2099-01-02' } },
      };
      const loadFuture = async () =>
        (
          await auth(request(app).get(`${route}/medication-occurrences`))
            .query({ from: '2099-01-01T00:00:00Z', to: '2099-01-03T00:00:00Z' })
            .expect(200)
        ).body.medicationOccurrences;
      let restored = (
        await auth(request(app).post(`${route}/medications`))
          .send(futureDetails)
          .expect(201)
      ).body.medication;
      const restoredRoute = `${route}/medications/${restored.id}`;
      const originalDose = (await loadFuture()).find((dose) => dose.medicationId === restored.id);
      restored = (
        await auth(request(app).patch(restoredRoute))
          .send({
            ...futureDetails,
            version: restored.version,
            schedule: { ...futureDetails.schedule, times: ['09:00'] },
          })
          .expect(200)
      ).body.medication;
      await loadFuture();
      restored = (
        await auth(request(app).patch(restoredRoute))
          .send({ ...futureDetails, version: restored.version, dosage: '2 tablets' })
          .expect(200)
      ).body.medication;
      const newDose = (await loadFuture()).find(
        (dose) => dose.medicationId === restored.id && dose.scheduledAt === originalDose.scheduledAt,
      );
      assert.notEqual(newDose.id, originalDose.id);
      await auth(request(app).patch(`${route}/medication-occurrences/${originalDose.id}`))
        .send({ status: 'completed', version: originalDose.version })
        .expect(404);
      const oldPersonTaken = (
        await auth(request(app).patch(`${route}/medication-occurrences/${newDose.id}`))
          .send({ status: 'completed', version: newDose.version })
          .expect(200)
      ).body.medicationOccurrence;
      restored = (
        await auth(request(app).patch(restoredRoute))
          .send({ ...futureDetails, version: restored.version, recipientId: secondRecipient })
          .expect(200)
      ).body.medication;
      const movedRows = (await loadFuture()).filter((dose) => dose.medicationId === restored.id);
      assert.deepEqual(
        movedRows.find((dose) => dose.id === oldPersonTaken.id),
        oldPersonTaken,
      );
      assert.ok(
        movedRows.some(
          (dose) =>
            dose.recipientId === secondRecipient &&
            dose.scheduledAt === oldPersonTaken.scheduledAt &&
            dose.status === 'pending',
        ),
      );

      // Ancient schedules are advanced a little at a time, with bounded response pages.
      const huge = (
        await auth(request(app).post(`${route}/medications`))
          .send({
            ...details,
            name: 'Long history',
            assignedCaregiverId: null,
            schedule: {
              ...schedule,
              startsOn: '0100-01-01',
              end: { kind: 'never' },
              times: Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`),
            },
          })
          .expect(201)
      ).body.medication;
      const newlyAdded = (
        await auth(request(app).get(`${route}/medication-occurrences/overdue`))
          .query({ before: '2030-01-01T00:00:00Z' })
          .expect(200)
      ).body;
      assert.deepEqual(
        newlyAdded.medicationOccurrences.filter((dose) => dose.medicationId === huge.id),
        [],
      );
      assert.equal(newlyAdded.historyPending, false);
      // Explicitly simulate genuinely tracked old history to exercise bounded paging.
      await trackFrom(huge.id, '0099-12-30T00:00:00Z');
      const firstPage = (
        await auth(request(app).get(`${route}/medication-occurrences/overdue`))
          .query({ before: '2030-01-01T00:00:00Z' })
          .expect(200)
      ).body;
      assert.equal(firstPage.historyPending, true);
      assert.equal(firstPage.medicationOccurrences.length, 100);
      assert.ok(firstPage.nextCursor);
      const secondPage = (
        await auth(request(app).get(`${route}/medication-occurrences/overdue`))
          .query({ before: '2030-01-01T00:00:00Z', cursor: firstPage.nextCursor })
          .expect(200)
      ).body;
      assert.equal(
        new Set(
          [...firstPage.medicationOccurrences, ...secondPage.medicationOccurrences].map((dose) => dose.id),
        ).size,
        200,
      );
      const coverage = (await db.query('SELECT history_through FROM medications WHERE id=$1', [huge.id]))
        .rows[0].history_through;
      assert.ok(coverage.getTime() < Date.parse('0101-01-01T00:00:00Z'));
      // Edits remain possible between batches, rather than waiting for the whole history.
      await auth(request(app).patch(`${route}/medications/${huge.id}`))
        .send({ ...details, version: huge.version })
        .expect(200);

      // A caregiver with an already-open page loses both reads and writes after removal.
      await db.query('DELETE FROM circle_members WHERE circle_id=$1 AND user_id=$2', [circle, caregiver]);
      await request(app).get(`${route}/medications`).set('x-test-user', caregiver).expect(404);
      await request(app)
        .patch(doseRoute)
        .set('x-test-user', caregiver)
        .send({ status: 'pending', version: latest.version })
        .expect(404);
      // Stopping keeps historical rows, retires future pending rows, and never regenerates them.
      const course = (
        await auth(request(app).post(`${route}/medications`))
          .send({
            ...details,
            name: 'Stopped course',
            schedule: { ...schedule, end: { kind: 'never' } },
          })
          .expect(201)
      ).body.medication;
      const courseRoute = `${route}/medications/${course.id}`;
      await trackFrom(course.id, '2019-12-31T00:00:00Z');
      const loadCourse = async (from, to) =>
        (
          await auth(request(app).get(`${route}/medication-occurrences`))
            .query({ from, to })
            .expect(200)
        ).body.medicationOccurrences.filter((dose) => dose.medicationId === course.id);
      const pastRows = await loadCourse('2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z');
      const futureRows = await loadCourse('2099-01-01T00:00:00Z', '2099-01-02T00:00:00Z');
      const early = (
        await auth(request(app).patch(`${route}/medication-occurrences/${futureRows[0].id}`))
          .send({ status: 'completed', version: futureRows[0].version })
          .expect(200)
      ).body.medicationOccurrence;
      const stoppedCourse = (
        await auth(request(app).post(`${courseRoute}/stop`))
          .send({ version: course.version })
          .expect(200)
      ).body.medication;
      assert.ok(stoppedCourse.stoppedAt);
      assert.equal(stoppedCourse.version, course.version + 1);
      assert.deepEqual(
        (await loadCourse('2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z')).map(
          ({ medicationStoppedAt, ...dose }) => dose,
        ),
        pastRows,
      );
      const remainingFuture = await loadCourse('2099-01-01T00:00:00Z', '2099-01-02T00:00:00Z');
      assert.equal(remainingFuture.length, 1);
      assert.equal(remainingFuture[0].id, early.id);
      await auth(request(app).patch(`${route}/medication-occurrences/${early.id}`))
        .send({ status: 'pending', version: early.version })
        .expect(409);
      await auth(request(app).patch(`${route}/medication-occurrences/${pastRows[0].id}`))
        .send({ status: 'completed', version: pastRows[0].version })
        .expect(200);
      await auth(request(app).post(`${courseRoute}/stop`))
        .send({ version: course.version })
        .expect(409);
      const repeatedStop = (
        await auth(request(app).post(`${courseRoute}/stop`))
          .send({ version: stoppedCourse.version })
          .expect(200)
      ).body.medication;
      assert.equal(repeatedStop.stoppedAt, stoppedCourse.stoppedAt);
      assert.equal(repeatedStop.version, stoppedCourse.version);
      await auth(request(app).patch(courseRoute))
        .send({ ...details, version: stoppedCourse.version })
        .expect(409);
      await auth(request(app).delete(courseRoute)).send({ version: stoppedCourse.version }).expect(204);
      const beforeDelete = (
        await db.query('SELECT status FROM medication_occurrences WHERE medication_id=$1', [medication.id])
      ).rows;
      assert.ok(beforeDelete.some((row) => row.status === 'completed'));
      assert.ok(beforeDelete.some((row) => row.status === 'pending'));
      await auth(request(app).delete(item)).send({ version: current.version }).expect(204);
      assert.equal(
        (
          await db.query('SELECT count(*)::int AS count FROM medication_occurrences WHERE medication_id=$1', [
            medication.id,
          ])
        ).rows[0].count,
        0,
      );
      assert.equal(
        (
          await db.query('SELECT count(*)::int AS count FROM medication_revisions WHERE medication_id=$1', [
            medication.id,
          ])
        ).rows[0].count,
        0,
      );
      assert.ok(!(await load()).some((dose) => dose.medicationId === medication.id));
      await auth(request(app).delete(item)).send({ version: current.version }).expect(404);
      await auth(request(app).delete(backfillItem)).send({ version: changed.version }).expect(204);
      const migration = fs.readFileSync(
        path.join(migrationDir, '1795478400000_create-medications.sql'),
        'utf8',
      );
      const revisionMigration = fs.readFileSync(
        path.join(migrationDir, '1795564800000_medication-revisions.sql'),
        'utf8',
      );
      const stopMigration = fs.readFileSync(
        path.join(migrationDir, '1795651200000_stop-medications.sql'),
        'utf8',
      );
      await db.query(stopMigration.split('-- Down Migration')[1]);
      await db.query(revisionMigration.split('-- Down Migration')[1]);
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
