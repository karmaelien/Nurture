import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

// The tests wipe this database before every test, so refuse anything that could be the real one.
export const resolveTestDatabaseUrl = () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'Set TEST_DATABASE_URL in nurture-api/.env to a separate database, such as ' +
      'postgres://user:password@localhost:5432/nurture_test. The tests delete everything in it.'
    );
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL, because the tests delete all data.');
  }
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to use database "${name}": its name must contain "test", because the tests delete all data.`);
  }
  return url;
};
