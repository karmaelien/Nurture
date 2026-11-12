import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTestDatabaseUrl } from './test-db.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const root = fileURLToPath(new URL('..', import.meta.url));

// Runs once before the whole suite: rebuild the test database from the migrations,
// so the tests always run against the schema the migrations actually produce.
export default async function setup() {
  try {
    await resetDatabase();
  } catch (err) {
    // Vitest 5 crashes while printing errors thrown here and then reports "No test files found",
    // so print the real reason first.
    console.error(`\nTest database setup failed: ${err.message}\n${err.stderr ?? ''}`);
    throw err;
  }
}

async function resetDatabase() {
  const url = resolveTestDatabaseUrl();

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }

  execFileSync(path.join(root, 'node_modules/.bin/node-pg-migrate'), ['-m', 'src/db/migrations', 'up'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
