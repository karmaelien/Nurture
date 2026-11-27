import { expect, test } from 'vitest';
import request from 'supertest';
import { app, register, createCircle } from './helpers.mjs';

test('shared server mounts document routes behind real session authentication', async () => {
  const { token } = await register('DocumentOwner');
  const circle = await createCircle(token);
  const path = `/api/circles/${circle.id}/documents`;
  await request(app).get(path).expect(401);
  // Invalid PDF content never reaches the embedding provider, even if a developer has an API key.
  const uploaded = await request(app).post(path).set('Authorization', `Bearer ${token}`)
    .field('metadata', JSON.stringify({ recipientId: circle.recipients[0].id, title: 'Test PDF', category: 'medical', sharing: { mode: 'selected', memberIds: [] } }))
    .attach('file', Buffer.from('%PDF-invalid'), { filename: 'test.pdf', contentType: 'application/pdf' }).expect(201);
  expect(uploaded.body.document.processingStatus).toBe('failed');
  expect(uploaded.body.document.processingError).toBe('invalid_pdf');
  const outsider = await register('DocumentOutsider');
  await request(app).get(`${path}/${uploaded.body.document.id}/file`).set('Authorization', `Bearer ${outsider.token}`).expect(404);
  await request(app).get(`${path}/${uploaded.body.document.id}/file`).set('Authorization', `Bearer ${token}`).expect(200);
});
