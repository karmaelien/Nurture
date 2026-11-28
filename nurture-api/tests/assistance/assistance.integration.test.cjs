const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const connectionString = process.env.ASSISTANCE_TEST_DATABASE_URL;

test(
  'PostgreSQL assistance reports preserve circumstances, isolate families, paginate, and serialize notification writes',
  {
    skip:
      !connectionString &&
      'Set ASSISTANCE_TEST_DATABASE_URL to a separate local test database.',
  },
  async () => {
    const url = new URL(connectionString);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/test/i.test(url.pathname) ||
      connectionString === process.env.DATABASE_URL
    )
      throw new Error(
        'Use a separate local test database, never the application DATABASE_URL.',
      );
    const { Pool } = require('pg');
    const express = require('express');
    const request = require('supertest');
    const createRouter = require('../../src/routes/assistance.routes');
    const schema = `assistance_test_${process.pid}_${Date.now()}`;
    const admin = new Pool({ connectionString });
    const db = new Pool({
      connectionString,
      options: `-c search_path=${schema},public`,
    });
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      const migrations = path.join(__dirname, '../../src/db/migrations');
      for (const file of fs
        .readdirSync(migrations)
        .filter((file) => file.endsWith('.sql'))
        .sort())
        await db.query(
          fs
            .readFileSync(path.join(migrations, file), 'utf8')
            .split('-- Down Migration')[0],
        );
      const insert = async (sql, values = []) =>
        String((await db.query(sql + ' RETURNING id', values)).rows[0].id);
      const owner = await insert(
        "INSERT INTO users(email,password_hash,username) VALUES ('assistance-owner@test.invalid','unused','Owner')",
      );
      const caregiver = await insert(
        "INSERT INTO users(email,password_hash,username) VALUES ('assistance-member@test.invalid','unused','Member')",
      );
      const outsider = await insert(
        "INSERT INTO users(email,password_hash,username) VALUES ('assistance-other@test.invalid','unused','Other')",
      );
      const circle = await insert(
        "INSERT INTO circles(name,created_by) VALUES ('Family',$1)",
        [owner],
      );
      const other = await insert(
        "INSERT INTO circles(name,created_by) VALUES ('Other',$1)",
        [outsider],
      );
      await db.query(
        "INSERT INTO circle_members(circle_id,user_id,display_name,role) VALUES ($1,$2,'Owner','owner'),($1,$3,'Member','member'),($4,$5,'Other','owner')",
        [circle, owner, caregiver, other, outsider],
      );
      const person = await insert(
        "INSERT INTO recipients(circle_id,name) VALUES ($1,'Rose')",
        [circle],
      );
      const foreign = await insert(
        "INSERT INTO recipients(circle_id,name) VALUES ($1,'Other')",
        [other],
      );
      const medicine = await insert(
        "INSERT INTO medications(circle_id,recipient_id,name,dosage,schedule) VALUES ($1,$2,'Test medicine','1 tablet','{}')",
        [circle, person],
      );
      const foreignMedicine = await insert(
        "INSERT INTO medications(circle_id,recipient_id,name,dosage,schedule) VALUES ($1,$2,'Other medicine','1 tablet','{}')",
        [other, foreign],
      );
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        if (req.headers['x-test-user'])
          req.user = { id: req.headers['x-test-user'] };
        next();
      });
      app.use('/api/circles/:circleId', createRouter({ db }));
      app.use(require('../../src/middleware/errorHandler'));
      const route = `/api/circles/${circle}/assistance-reports`;
      const auth = (req, user = owner) => req.set('x-test-user', user);
      const body = {
        requestId: randomUUID(),
        medicationId: medicine,
        reason: 'price_increase',
        previousCostCents: 1000,
        currentCostCents: 2000,
        notes: 'Same refill quantity',
      };
      assert.equal((await request(app).get(route)).status, 401);
      assert.equal(
        (await auth(request(app).post(route), outsider).send(body)).status,
        404,
      );
      assert.equal(
        (
          await auth(request(app).post(route)).send({
            ...body,
            medicationId: foreignMedicine,
          })
        ).status,
        404,
      );
      assert.equal(
        (await auth(request(app).get(route).query({ recipientId: foreign })))
          .status,
        404,
      );
      assert.equal(
        (
          await auth(request(app).post(route)).send({
            ...body,
            currentCostCents: 500,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await auth(request(app).post(route)).send({
            ...body,
            recipientId: foreign,
          })
        ).status,
        400,
      );
      const pair = await Promise.all([
        auth(request(app).post(route)).send(body),
        auth(request(app).post(route)).send(body),
      ]);
      assert.deepEqual(
        pair.map((item) => item.status),
        [201, 201],
      );
      assert.equal(pair[0].body.report.id, pair[1].body.report.id);
      const original = pair[0].body.report;
      assert.equal(original.recipientId, person);
      assert.equal(original.medicationName, 'Test medicine');
      assert.ok(pair[0].body.resources.length >= 2);
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM patient_assistance_reports',
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await auth(request(app).post(route)).send({
            ...body,
            notes: 'Changed payload',
          })
        ).status,
        409,
      );
      assert.equal(
        (await auth(request(app).get(`${route}/${original.id}`), outsider))
          .status,
        404,
      );
      const notification = `${route}/${original.id}/notification`;
      assert.equal(
        (
          await auth(request(app).patch(notification)).send({
            dismissed: true,
            version: 1,
            notes: 'forged',
          })
        ).status,
        400,
      );
      const writes = await Promise.all([
        auth(request(app).patch(notification)).send({
          dismissed: true,
          version: 1,
        }),
        auth(request(app).patch(notification), caregiver).send({
          dismissed: true,
          version: 1,
        }),
      ]);
      assert.deepEqual(writes.map((item) => item.status).sort(), [200, 409]);
      const dismissed = writes.find((item) => item.status === 200).body.report;
      assert.ok(dismissed.dismissedAt);
      assert.equal(dismissed.version, 2);
      for (const key of [
        'previousCostCents',
        'currentCostCents',
        'reason',
        'notes',
        'medicationName',
        'recipientId',
        'createdAt',
        'reportedBy',
      ])
        assert.equal(dismissed[key], original[key]);
      assert.equal((await auth(request(app).get(route))).body.totalCount, 0);
      assert.equal(
        (await auth(request(app).get(route).query({ status: 'dismissed' })))
          .body.totalCount,
        1,
      );
      const restored = await auth(request(app).patch(notification)).send({
        dismissed: false,
        version: 2,
      });
      assert.equal(restored.status, 200);
      assert.equal(restored.body.report.dismissedAt, null);
      const coverage = await auth(request(app).post(route), caregiver).send({
        ...body,
        requestId: randomUUID(),
        reason: 'not_covered',
        previousCostCents: null,
        currentCostCents: null,
      });
      assert.equal(coverage.status, 201);
      // Commit a competing save after the count query's statement completes.
      // Separate count/page statements would return count=2 with three records.
      const concurrentId = randomUUID();
      let interleaved = false;
      const snapshotModel = require('../../src/models/assistance.model')({
        connect: async () => {
          const client = await db.connect();
          return {
            release: () => client.release(),
            query: async (...args) => {
              const result = await client.query(...args);
              if (!interleaved && /count\(\*\)::int/.test(args[0])) {
                interleaved = true;
                await db.query(
                  `INSERT INTO patient_assistance_reports (id,circle_id,recipient_id,medication_id,medication_name,reason,reported_by,request_body)
                   VALUES ($1,$2,$3,$4,'Concurrent medicine','not_covered',$5,'{}')`,
                  [concurrentId, circle, person, medicine, caregiver],
                );
              }
              return result;
            },
          };
        },
      });
      const consistent = await snapshotModel.run(circle, owner, (scope) =>
        scope.list({ status: 'active' }),
      );
      assert.equal(interleaved, true);
      assert.equal(consistent.totalCount, 2);
      assert.equal(consistent.reports.length, 2);
      assert.equal((await auth(request(app).get(route))).body.totalCount, 3);
      await db.query('DELETE FROM patient_assistance_reports WHERE id=$1', [
        concurrentId,
      ]);
      await db.query(
        `INSERT INTO patient_assistance_reports (id,circle_id,recipient_id,medication_id,medication_name,reason,reported_by,request_body)
      SELECT gen_random_uuid(),$1,$2,$3,'Bulk medicine','not_covered',$4,'{}'::jsonb FROM generate_series(1,55)`,
        [circle, person, medicine, owner],
      );
      const first = (await auth(request(app).get(route))).body;
      assert.equal(first.reports.length, 50);
      assert.equal(first.totalCount, 57);
      assert.ok(first.nextCursor);
      const second = (
        await auth(request(app).get(route).query({ cursor: first.nextCursor }))
      ).body;
      assert.equal(second.reports.length, 7);
      assert.equal(second.nextCursor, null);
      const emptyPage = (
        await auth(
          request(app)
            .get(route)
            .query({ cursor: `1900-01-01T00:00:00.000Z|${randomUUID()}` }),
        )
      ).body;
      assert.deepEqual(emptyPage.reports, []);
      assert.equal(emptyPage.totalCount, 57);
      assert.equal(emptyPage.nextCursor, null);
      assert.equal(
        new Set([...first.reports, ...second.reports].map((item) => item.id))
          .size,
        57,
      );
      await db.query('DELETE FROM medications WHERE id=$1', [medicine]);
      const history = await auth(request(app).get(`${route}/${original.id}`));
      assert.equal(history.body.report.medicationId, null);
      assert.equal(history.body.report.medicationName, 'Test medicine');
      assert.equal(
        (await auth(request(app).post(route)).send(body)).status,
        201,
      );
      await db.query(
        'DELETE FROM circle_members WHERE circle_id=$1 AND user_id=$2',
        [circle, caregiver],
      );
      assert.equal(
        (await auth(request(app).get(`${route}/${original.id}`), caregiver))
          .status,
        404,
      );
      assert.equal(
        (
          await auth(request(app).patch(notification), caregiver).send({
            dismissed: true,
            version: 3,
          })
        ).status,
        404,
      );
    } finally {
      await db.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  },
);
