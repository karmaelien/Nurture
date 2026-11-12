import { beforeEach } from 'vitest';
import { resolveTestDatabaseUrl } from './test-db.mjs';

// Point the app at the test database before anything loads src/config/db.js.
process.env.DATABASE_URL = resolveTestDatabaseUrl();
process.env.NODE_ENV = 'test';

const { db } = await import('./helpers.mjs');

// Every test starts from empty tables, so tests can't depend on each other.
beforeEach(async () => {
  const { rows } = await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'pgmigrations'`
  );
  if (rows.length > 0) {
    const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
    await db.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
});
