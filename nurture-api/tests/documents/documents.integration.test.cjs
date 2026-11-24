const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const express = require('express');
const request = require('supertest');
const createRouter = require('../../src/routes/documents.routes');
const errorHandler = require('../../src/middleware/errorHandler');

const connectionString = process.env.DOCUMENT_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Use tests/documents/run-local.sh.');
const url = new URL(connectionString);
if (url.hostname !== '127.0.0.1' || url.pathname !== '/nurture_documents_test') throw new Error('Document tests require a dedicated local test database.');
const pool = new Pool({ connectionString });
const db = { query: (...args) => pool.query(...args), async transaction(fn) {
  const tx = await pool.connect();
  try { await tx.query('BEGIN'); const value = await fn(tx); await tx.query('COMMIT'); return value; }
  catch (error) { await tx.query('ROLLBACK'); throw error; } finally { tx.release(); }
} };
let failInsert, failDelete, failGrant;
const injectedDb = { async transaction(fn) { return db.transaction(tx => fn({ query: (sql, params) => {
  if (failInsert && sql.startsWith('INSERT INTO care_documents')) throw new Error('simulated insert failure');
  if (failDelete && sql.startsWith('DELETE FROM care_documents')) throw new Error('simulated delete failure');
  if (failGrant && sql.startsWith('INSERT INTO document_grants')) throw new Error('simulated grant failure');
  return tx.query(sql, params);
} })); } };
const app = express();
app.use(express.json());
// Test-only identity adapter; production mounts the real authenticate middleware.
app.use((req, res, next) => { if (req.headers['x-test-user']) req.user = { id: Number(req.headers['x-test-user']) }; next(); });
app.use('/api/circles/:circleId/documents', createRouter({ db: injectedDb }));
app.use(errorHandler);
let owner, uploader, reader, hidden, outsider, circle, recipient, foreignRecipient;
const insert = async (sql, params = []) => String((await db.query(sql + ' RETURNING id', params)).rows[0].id);
const route = () => `/api/circles/${circle}/documents`;
const auth = (req, user = uploader) => req.set('x-test-user', user);
const metadata = (overrides = {}) => ({ title: 'Test report', category: 'medical', recipientId: recipient, sharing: { mode: 'selected', memberIds: [reader] }, ...overrides });
const pdf = Buffer.from('%PDF-1.4\nSample test fixture\n%%EOF');
const upload = (body = metadata(), bytes = pdf, type = 'application/pdf') => auth(request(app).post(route())).field('metadata', JSON.stringify(body)).attach('file', bytes, { filename: 'report.pdf', contentType: type });
const create = async body => (await upload(body).expect(201)).body.document;
before(async () => {
  const migrationDir = path.join(__dirname, '../../src/db/migrations');
  for (const file of (await fs.readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort()) {
    const sql = await fs.readFile(path.join(migrationDir, file), 'utf8');
    await db.query(sql.split('-- Down Migration')[0].replace('-- Up Migration', ''));
  }
  const users = [];
  for (const name of ['owner', 'uploader', 'reader', 'hidden', 'outsider']) users.push(await insert('INSERT INTO users(email,password_hash,username) VALUES ($1,$2,$3)', [`${name}@test.invalid`, 'unused', name]));
  [owner, uploader, reader, hidden, outsider] = users;
  circle = await insert("INSERT INTO circles(name,created_by) VALUES ('Test',$1)", [owner]);
  for (const user of users.slice(0, 4)) await db.query('INSERT INTO circle_members(circle_id,user_id,display_name,role) VALUES ($1,$2,$3,$4)', [circle, user, 'Test', user === owner ? 'owner' : 'member']);
  recipient = await insert("INSERT INTO recipients(circle_id,name) VALUES ($1,'Rose')", [circle]);
  const otherCircle = await insert("INSERT INTO circles(name,created_by) VALUES ('Other',$1)", [outsider]);
  foreignRecipient = await insert("INSERT INTO recipients(circle_id,name) VALUES ($1,'Other')", [otherCircle]);
});
beforeEach(async () => {
  failInsert = failDelete = failGrant = false;
  await db.query('DELETE FROM care_documents');
});
after(async () => { await pool.end(); });

test('upload, list, download, edit and delete persist private bytes and metadata', async () => {
  const doc = await create(metadata({ title: '  Report  ' }));
  assert.equal(doc.title, 'Report');
  assert.equal(doc.canManage, true);
  assert.equal(doc.storageKey, undefined);
  assert.deepEqual((await db.query('SELECT file_bytes FROM care_documents WHERE id=$1', [doc.id])).rows[0].file_bytes, pdf);
  assert.equal(doc.file_bytes, undefined);
  const downloaded = await auth(request(app).get(`${route()}/${doc.id}/file`)).expect(200);
  assert.deepEqual(downloaded.body, pdf);
  assert.equal(downloaded.headers['cache-control'], 'private, no-store');
  assert.match(downloaded.headers['content-disposition'], /^attachment/);
  await auth(request(app).patch(`${route()}/${doc.id}`)).send({ version: 1, title: 'Edited' }).expect(200);
  assert.equal((await auth(request(app).get(route())).expect(200)).body.documents[0].title, 'Edited');
  await auth(request(app).delete(`${route()}/${doc.id}`)).expect(204);
  assert.equal((await db.query('SELECT count(*) FROM care_documents')).rows[0].count, '0');
  await auth(request(app).get(`${route()}/${doc.id}`)).expect(404);
});
test('selected readers see files but cannot manage; hidden members and outsiders see nothing', async () => {
  const doc = await create();
  assert.equal((await auth(request(app).get(`${route()}/${doc.id}`), reader)).body.document.canManage, false);
  await auth(request(app).get(`${route()}/${doc.id}/file`), reader).expect(200);
  for (const method of ['patch', 'delete']) await auth(request(app)[method](`${route()}/${doc.id}`), reader).send({ version: 1, title: 'No' }).expect(403);
  for (const user of [hidden, outsider]) {
    for (const suffix of ['', '/file']) await auth(request(app).get(`${route()}/${doc.id}${suffix}`), user).expect(404);
    await auth(request(app).delete(`${route()}/${doc.id}`), user).expect(404);
  }
  assert.deepEqual((await auth(request(app).get(route()), hidden)).body.documents, []);
  await request(app).get(route()).expect(401);
  await request(app).post(route()).expect(401);
  await auth(request(app).get(`${route()}/${doc.id}`), owner).expect(200);
  await auth(request(app).patch(`${route()}/${doc.id}`), owner).send({ version: 1, title: 'Owner edit' }).expect(200);
});
test('sharing changes take effect and owner/uploader exceptions persist', async () => {
  const doc = await create();
  await auth(request(app).patch(`${route()}/${doc.id}`)).send({ version: 1, sharing: { mode: 'circle', memberIds: [] } }).expect(200);
  await auth(request(app).get(`${route()}/${doc.id}/file`), hidden).expect(200);
  await auth(request(app).patch(`${route()}/${doc.id}`)).send({ version: 2, sharing: { mode: 'selected', memberIds: [] } }).expect(200);
  await auth(request(app).get(`${route()}/${doc.id}`), reader).expect(404);
  await auth(request(app).get(`${route()}/${doc.id}`), owner).expect(200);
  await auth(request(app).get(`${route()}/${doc.id}`)).expect(200);
});
test('removing a member cascades grants; rejoining does not restore explicit access', async () => {
  const doc = await create();
  await db.query('DELETE FROM circle_members WHERE circle_id=$1 AND user_id=$2', [circle, reader]);
  await auth(request(app).get(`${route()}/${doc.id}/file`), reader).expect(404);
  await db.query("INSERT INTO circle_members(circle_id,user_id,display_name,role) VALUES ($1,$2,'Reader','member')", [circle, reader]);
  await auth(request(app).get(`${route()}/${doc.id}`), reader).expect(404);
  await db.query('DELETE FROM circle_members WHERE circle_id=$1 AND user_id=$2', [circle, uploader]);
  await auth(request(app).get(`${route()}/${doc.id}`)).expect(404);
  await auth(request(app).delete(`${route()}/${doc.id}`), owner).expect(204);
  await db.query("INSERT INTO circle_members(circle_id,user_id,display_name,role) VALUES ($1,$2,'Uploader','member')", [circle, uploader]);
});
test('metadata, file and recipient validation reject writes without leftovers', async () => {
  for (const body of [metadata({ title: ' ' }), metadata({ unknown: true }), metadata({ sharing: { mode: 'selected', memberIds: [reader, reader] } }), metadata({ sharing: { mode: 'circle', memberIds: [reader] } })]) await upload(body).expect(400);
  await upload(metadata({ recipientId: foreignRecipient })).expect(404);
  await upload(metadata({ sharing: { mode: 'selected', memberIds: [outsider] } })).expect(404);
  await upload(metadata(), Buffer.from('not PDF')).expect(415);
  await upload(metadata(), pdf, 'image/png').expect(415);
  await upload(metadata(), Buffer.alloc(10485761)).expect(413);
  await upload(metadata(), Buffer.alloc(0)).expect(400);
  assert.equal((await db.query('SELECT count(*) FROM care_documents')).rows[0].count, '0');
  assert.equal((await db.query('SELECT count(*) FROM care_documents')).rows[0].count, '0');
});
test('filters combine, search uses literal substring, invalid patches preserve metadata', async () => {
  const doc = await create(metadata({ title: '100% Report' }));
  await create(metadata({ title: 'Invoice', category: 'financial' }));
  const filtered = await auth(request(app).get(route())).query({ recipientId: recipient, category: 'medical', search: '% rePORT' }).expect(200);
  assert.deepEqual(filtered.body.documents.map(d => d.id), [doc.id]);
  await auth(request(app).get(route())).query({ recipientId: foreignRecipient }).expect(404);
  for (const body of [{}, { recipientId: recipient }, { title: '' }]) await auth(request(app).patch(`${route()}/${doc.id}`)).send(body).expect(400);
  await auth(request(app).patch(`${route()}/${doc.id}`)).send({ version: 1, sharing: { mode: 'selected', memberIds: [outsider] } }).expect(404);
  assert.equal((await auth(request(app).get(`${route()}/${doc.id}`))).body.document.title, doc.title);
});
test('failed uploads and grants roll back bytes, metadata and permissions together', async () => {
  failInsert = true;
  await upload().expect(500);
  failInsert = false;
  failGrant = true;
  await upload().expect(500);
  failGrant = false;
  assert.equal((await db.query('SELECT count(*) FROM care_documents')).rows[0].count, '0');
  assert.equal((await db.query('SELECT count(*) FROM document_grants')).rows[0].count, '0');
});

test('failed deletion retains the complete document and succeeds on retry', async () => {
  const doc = await create();
  failDelete = true;
  await auth(request(app).delete(`${route()}/${doc.id}`)).expect(500);
  assert.deepEqual((await auth(request(app).get(`${route()}/${doc.id}/file`)).expect(200)).body, pdf);
  failDelete = false;
  await auth(request(app).delete(`${route()}/${doc.id}`)).expect(204);
  assert.equal((await db.query('SELECT count(*) FROM document_grants')).rows[0].count, '0');
});

test('SQL enforces byte length and recipient deletion removes files and grants', async () => {
  const tempRecipient = await insert("INSERT INTO recipients(circle_id,name) VALUES ($1,'Temporary')", [circle]);
  const doc = await create(metadata({ recipientId: tempRecipient }));
  await assert.rejects(db.query('UPDATE care_documents SET file_bytes=$1 WHERE id=$2', [Buffer.from('wrong length'), doc.id]), { code: '23514' });
  await db.query('DELETE FROM recipients WHERE id=$1', [tempRecipient]);
  assert.equal((await db.query('SELECT count(*) FROM care_documents WHERE id=$1', [doc.id])).rows[0].count, '0');
  assert.equal((await db.query('SELECT count(*) FROM document_grants WHERE document_id=$1', [doc.id])).rows[0].count, '0');
});

test('multipart supports frontend field order and exact size limit, rejects malformed fields', async () => {
  const bytes = Buffer.alloc(10485760);
  pdf.copy(bytes);
  await auth(request(app).post(route())).attach('file', bytes, { filename: 'report.pdf', contentType: 'application/pdf' }).field('metadata', JSON.stringify(metadata())).expect(201);
  await auth(request(app).post(route())).field('metadata', '{bad').attach('file', pdf, 'report.pdf').expect(400);
  await auth(request(app).post(route())).field('metadata', JSON.stringify(metadata())).field('extra', 'no').attach('file', pdf, 'report.pdf').expect(400);
  await auth(request(app).post(route())).field('metadata', JSON.stringify(metadata())).attach('file', pdf, 'report.pdf').attach('file', pdf, 'second.pdf').expect(400);
  const doc = await create();
  await auth(request(app).get(`${route()}/${doc.id}/file`)).query({ disposition: 'inline' }).expect('Content-Disposition', /^inline/).expect(200);
  await auth(request(app).get(`${route()}/${doc.id}/file`)).query({ disposition: 'bad' }).expect(400);
});

test('stale edits cannot restore revoked access and concurrent saves have one winner', async () => {
  const doc = await create();
  await auth(request(app).patch(`${route()}/${doc.id}`), owner).send({ version: doc.version, sharing: { mode: 'selected', memberIds: [] } }).expect(200);
  const stale = await auth(request(app).patch(`${route()}/${doc.id}`)).send({ version: doc.version, title: 'Stale', sharing: doc.sharing }).expect(409);
  assert.equal(stale.body.error.code, 'document_conflict');
  await auth(request(app).get(`${route()}/${doc.id}/file`), reader).expect(404);
  const saved = (await auth(request(app).get(`${route()}/${doc.id}`))).body.document;
  assert.equal(saved.title, doc.title);
  assert.equal(saved.version, doc.version + 1);
  const results = await Promise.all(['First', 'Second'].map(title => auth(request(app).patch(`${route()}/${doc.id}`)).send({ version: saved.version, title })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  await auth(request(app).patch(`${route()}/${doc.id}`)).send({ title: 'Missing version' }).expect(400);
  await auth(request(app).patch(`${route()}/${doc.id}`)).send({ version: saved.version + 1 }).expect(400);
});
