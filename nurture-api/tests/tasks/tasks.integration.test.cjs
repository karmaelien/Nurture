const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
  quiet: true,
});
const connectionString = process.env.TASK_TEST_DATABASE_URL;

test(
  'PostgreSQL task CRUD, recurrence, deletion exceptions, access, and simultaneous saves',
  {
    skip:
      !connectionString &&
      'Set TASK_TEST_DATABASE_URL to an isolated local test database.',
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
    const schema = `task_test_${process.pid}_${Date.now()}`;
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
      const add = async (sql) =>
        String((await db.query(sql + ' RETURNING id')).rows[0].id);
      const owner = await add(
        "INSERT INTO users(email,password_hash,username) VALUES ('task-owner@test.invalid','unused','Owner')",
      );
      const other = await add(
        "INSERT INTO users(email,password_hash,username) VALUES ('task-other@test.invalid','unused','Other')",
      );
      const circle = await add(
        `INSERT INTO circles(name,created_by) VALUES ('Task family',${owner})`,
      );
      const foreignCircle = await add(
        `INSERT INTO circles(name,created_by) VALUES ('Other family',${other})`,
      );
      await db.query(
        `INSERT INTO circle_members(circle_id,user_id,display_name,role) VALUES (${circle},${owner},'Owner','owner'),(${foreignCircle},${other},'Other','owner')`,
      );
      const recipientId = await add(
        `INSERT INTO recipients(name,circle_id) VALUES ('Rose',${circle})`,
      );
      const foreignRecipient = await add(
        `INSERT INTO recipients(name,circle_id) VALUES ('Other',${foreignCircle})`,
      );
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        if (req.headers['x-test-user'])
          req.user = { id: req.headers['x-test-user'] };
        next();
      });
      app.use(
        '/api/circles/:circleId',
        require('../../src/routes/tasks.routes')({ db }),
      );
      app.use(require('../../src/middleware/errorHandler'));
      const base = `/api/circles/${circle}`;
      const auth = (req) => req.set('x-test-user', owner);
      const details = {
        recipientId,
        title: 'Task sample',
        dueAt: null,
        assignedCaregiverId: null,
      };
      const create = async (body) =>
        (
          await auth(request(app).post(`${base}/tasks`))
            .send(body)
            .expect(201)
        ).body.task;
      const list = async (filters) =>
        (
          await auth(request(app).get(`${base}/tasks`))
            .query(filters ?? {})
            .expect(200)
        ).body;
      await request(app).get(`${base}/tasks`).expect(401);
      await request(app)
        .post(`${base}/tasks`)
        .set('x-test-user', other)
        .send({})
        .expect(404);
      await auth(request(app).post(`${base}/tasks`))
        .send({ ...details, recipientId: foreignRecipient })
        .expect(404);
      await auth(request(app).post(`${base}/tasks`))
        .send({ ...details, assignedCaregiverId: other })
        .expect(404);
      await auth(request(app).get(`${base}/tasks`))
        .query({ status: 'pending', completedFrom: '2020-01-01T00:00:00Z' })
        .expect(400);
      const single = await create(details);
      assert.equal(single.version, 1);
      assert.equal(single.dueAt, null);
      assert.equal(
        (await list({ dueBefore: '2099-01-01T00:00:00Z' })).tasks.length,
        0,
      );
      assert.equal(
        (
          await list({
            dueBefore: '2099-01-01T00:00:00Z',
            includeUndated: true,
          })
        ).tasks.length,
        1,
      );
      const saves = await Promise.all([
        auth(request(app).patch(`${base}/tasks/${single.id}`)).send({
          status: 'completed',
          version: 1,
        }),
        auth(request(app).patch(`${base}/tasks/${single.id}`)).send({
          ...details,
          title: 'Another edit',
          version: 1,
        }),
      ]);
      assert.deepEqual(saves.map((value) => value.status).sort(), [200, 409]);
      const current = (await list()).tasks[0];
      assert.equal(current.version, 2);
      const noChange = await auth(
        request(app).patch(`${base}/tasks/${single.id}`),
      )
        .send({ status: current.status, version: current.version })
        .expect(200);
      assert.equal(noChange.body.task.version, 2);
      const deletes = await Promise.all([
        auth(request(app).delete(`${base}/tasks/${single.id}`)).send({
          version: 2,
        }),
        auth(request(app).patch(`${base}/tasks/${single.id}`)).send({
          ...details,
          title: 'Concurrent edit',
          version: 2,
        }),
      ]);
      assert.ok(
        deletes.some((value) => value.status === 200 || value.status === 204),
      );
      assert.ok(
        deletes.some((value) => value.status === 404 || value.status === 409),
      );
      const start = new Date(Date.now() + 2 * 86400000);
      start.setUTCHours(8, 0, 0, 0);
      const recurrence = {
        unit: 'days',
        interval: 1,
        daysOfWeek: [],
        timeZone: 'UTC',
        end: { kind: 'afterOccurrences', count: 4 },
      };
      const first = await create({
        ...details,
        dueAt: start.toISOString(),
        recurrence,
      });
      const filters = {
        dueFrom: new Date(start.getTime() - 3600000).toISOString(),
        dueBefore: new Date(start.getTime() + 5 * 86400000).toISOString(),
      };
      const reads = await Promise.all([list(filters), list(filters)]);
      for (const read of reads) {
        assert.ok(read.tasks.length === 4 || read.historyPending);
        assert.equal(
          new Set(read.tasks.map((task) => task.id)).size,
          read.tasks.length,
        );
      }
      const converged = await list(filters);
      assert.equal(converged.tasks.length, 4);
      assert.equal(converged.historyPending, false);
      const occurrences = converged.tasks;
      // A fully generated schedule can be read while its parent is locked by an editor.
      // A new range skips the busy parent and reports incomplete history immediately.
      const blocker = await db.connect();
      try {
        await blocker.query('BEGIN');
        await blocker.query(
          'SELECT id FROM task_series WHERE id=$1 FOR UPDATE',
          [first.seriesId],
        );
        const unlockedRead = await auth(request(app).get(`${base}/tasks`))
          .query(filters)
          .timeout(2000)
          .expect(200);
        assert.equal(unlockedRead.body.tasks.length, 4);
        assert.equal(unlockedRead.body.historyPending, false);
        const newRange = {
          ...filters,
          dueFrom: new Date(start.getTime() - 2 * 86400000).toISOString(),
        };
        const skipped = await auth(request(app).get(`${base}/tasks`))
          .query(newRange)
          .timeout(2000)
          .expect(200);
        assert.equal(skipped.body.historyPending, true);
        // Locking one schedule must not prevent another schedule from progressing.
        const independent = await create({
          ...details,
          title: 'Independent schedule',
          dueAt: start.toISOString(),
          recurrence,
        });
        const progressed = await auth(request(app).get(`${base}/tasks`))
          .query(newRange)
          .timeout(2000)
          .expect(200);
        assert.equal(
          progressed.body.tasks.filter(
            (task) => task.seriesId === independent.seriesId,
          ).length,
          4,
        );
        await auth(
          request(app).post(`${base}/task-series/${independent.seriesId}/stop`),
        )
          .send({ version: 1 })
          .expect(204);
        await blocker.query('ROLLBACK');
        assert.equal((await list(newRange)).historyPending, false);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
      }
      const saved = await auth(request(app).patch(`${base}/tasks/${first.id}`))
        .send({ ...details, version: 1 })
        .expect(200);
      assert.equal(saved.body.task.dueAt, null);
      await auth(request(app).delete(`${base}/tasks/${occurrences[1].id}`))
        .send({ version: 1 })
        .expect(204);
      assert.equal(
        (
          await list({
            ...filters,
            dueFrom: new Date(start.getTime() - 2 * 86400000).toISOString(),
          })
        ).tasks.some((task) => task.id === occurrences[1].id),
        false,
      );
      await auth(request(app).patch(`${base}/tasks/${occurrences[2].id}`))
        .send({ status: 'completed', version: 1 })
        .expect(200);
      await auth(
        request(app).post(`${base}/task-series/${first.seriesId}/stop`),
      )
        .send({ version: 1 })
        .expect(204);
      const afterStop = await list();
      const retained = afterStop.tasks.filter(
        (task) => task.seriesId === first.seriesId,
      );
      assert.equal(retained.length, 2);
      assert.ok(retained.some((task) => task.dueAt === null));
      assert.ok(retained.some((task) => task.status === 'completed'));
      assert.equal(afterStop.series[0].version, 2);
      await auth(
        request(app).post(`${base}/task-series/${first.seriesId}/stop`),
      )
        .send({ version: 1 })
        .expect(409);
      await auth(
        request(app).post(`${base}/task-series/${first.seriesId}/stop`),
      )
        .send({ version: 2 })
        .expect(204);
      await auth(request(app).get(`${base}/tasks`))
        .query(filters)
        .expect(200);
      assert.equal(
        (await list()).tasks.filter((task) => task.seriesId === first.seriesId)
          .length,
        2,
      );
      const before = (
        await db.query('SELECT count(*)::int AS n FROM task_series')
      ).rows[0].n;
      await auth(request(app).post(`${base}/tasks`))
        .send({ ...details, dueAt: '2020-01-01T08:00:00Z', recurrence })
        .expect(400);
      assert.equal(
        (await db.query('SELECT count(*)::int AS n FROM task_series')).rows[0]
          .n,
        before,
      );
      const racingSeries = await create({
        ...details,
        dueAt: start.toISOString(),
        recurrence,
      });
      await Promise.all([
        list(filters),
        auth(
          request(app).post(
            `${base}/task-series/${racingSeries.seriesId}/stop`,
          ),
        )
          .send({ version: 1 })
          .expect(204),
      ]);
      assert.equal(
        (await list(filters)).tasks.some(
          (task) => task.seriesId === racingSeries.seriesId,
        ),
        false,
      );
      // Editing one occurrence's profile preserves the original schedule metadata
      // without generating the original profile's series during a filtered read.
      const movedRecipient = await add(
        `INSERT INTO recipients(name,circle_id) VALUES ('Frank',${circle})`,
      );
      const movable = await create({
        ...details,
        dueAt: start.toISOString(),
        recurrence,
      });
      await auth(request(app).patch(`${base}/tasks/${movable.id}`))
        .send({
          ...details,
          recipientId: movedRecipient,
          dueAt: movable.dueAt,
          version: 1,
        })
        .expect(200);
      const movedList = await list({ ...filters, recipientId: movedRecipient });
      const moved = movedList.tasks.find((task) => task.id === movable.id);
      assert.equal(moved.seriesId, movable.seriesId);
      assert.equal(moved.seriesVersion, 1);
      assert.equal(moved.seriesTitle, details.title);
      assert.ok(moved.seriesDescription);
      assert.equal(movedList.series, undefined);
      const doneMoved = await auth(
        request(app).patch(`${base}/tasks/${moved.id}`),
      )
        .send({ status: 'completed', version: moved.version })
        .expect(200);
      assert.equal(doneMoved.body.task.seriesId, moved.seriesId);
      await auth(request(app).delete(`${base}/tasks/${moved.id}`))
        .send({ version: doneMoved.body.task.version })
        .expect(204);
      assert.equal(
        (await list(filters)).tasks.some((task) => task.id === moved.id),
        false,
      );
      const rollbackTask = await create(details);
      await db.query(`CREATE FUNCTION reject_task_test_write() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.title = 'Fail this save' THEN RAISE EXCEPTION 'Injected test write failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_task_test_write BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION reject_task_test_write()`);
      const failure = await auth(
        request(app).patch(`${base}/tasks/${rollbackTask.id}`),
      )
        .send({ ...details, title: 'Fail this save', version: 1 })
        .expect(500);
      assert.equal(failure.body.error.message, 'Something went wrong.');
      const unchanged = (await list()).tasks.find(
        (task) => task.id === rollbackTask.id,
      );
      assert.equal(unchanged.title, details.title);
      assert.equal(unchanged.version, 1);
      await db.query(
        'DROP TRIGGER reject_task_test_write ON tasks; DROP FUNCTION reject_task_test_write()',
      );
      await db.query(
        'DELETE FROM circle_members WHERE circle_id=$1 AND user_id=$2',
        [circle, owner],
      );
      await auth(request(app).get(`${base}/tasks`)).expect(404);
      await auth(request(app).patch(`${base}/tasks/${first.id}`))
        .send({ status: 'completed', version: 2 })
        .expect(404);
      // Verify the migration can be reversed independently.
      const taskMigration = fs.readFileSync(
        path.join(migrations, '1795824000000_create-tasks.sql'),
        'utf8',
      );
      await db.query(taskMigration.split('-- Down Migration')[1]);
    } finally {
      await db.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  },
);
