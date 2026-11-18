import { beforeEach, expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { documentsApi } from '../../api/documents.ts'
import { request } from '../../api/client.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { createDocumentSchema } from './schemas.ts'

beforeEach(async () => {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
})
const loginDaniel = async () =>
  setToken((await authApi.login({ email: 'daniel@example.test', password: 'mock-only-password' })).token)
it('filters inaccessible documents and denies file access and management to readers', async () => {
  await loginDaniel()
  const list = (await documentsApi.list('c_demo')).documents
  expect(list.map((d) => d.id)).toContain('doc_demo_0')
  expect(list.map((d) => d.id)).not.toContain('doc_demo_2')
  expect(list.every((d) => !d.canManage)).toBe(true)
  await expect(documentsApi.file('c_demo', 'doc_demo_2')).rejects.toMatchObject({ status: 404 })
  await expect(documentsApi.update('c_demo', 'doc_demo_0', { title: 'Changed' })).rejects.toMatchObject({ status: 403 })
  await expect(documentsApi.remove('c_demo', 'doc_demo_0')).rejects.toMatchObject({ status: 403 })
})
it('changes sharing and deletes files while enforcing current membership', async () => {
  await documentsApi.update('c_demo', 'doc_demo_2', { sharing: { mode: 'selected', memberIds: ['u_daniel'] } })
  await loginDaniel()
  expect((await documentsApi.file('c_demo', 'doc_demo_2')).size).toBeGreaterThan(0)
  const db = readDb()
  db.circles[0].members = db.circles[0].members.filter((m) => m.user.id !== 'u_daniel')
  writeDb(db)
  await expect(documentsApi.file('c_demo', 'doc_demo_2')).rejects.toMatchObject({ status: 404 })
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  await documentsApi.remove('c_demo', 'doc_demo_2')
  await expect(documentsApi.file('c_demo', 'doc_demo_2')).rejects.toMatchObject({ status: 404 })
})
it('rejects invalid sharing and out-of-circle member IDs without changing data', async () => {
  expect(
    createDocumentSchema.safeParse({
      recipientId: 'r_rose',
      title: 'Test',
      category: 'medical',
      sharing: { mode: 'circle', memberIds: ['u_daniel'] },
    }).success,
  ).toBe(false)
  await expect(
    documentsApi.update('c_demo', 'doc_demo_0', { sharing: { mode: 'selected', memberIds: ['outsider'] } }),
  ).rejects.toMatchObject({ status: 404 })
  const result = await request<{ document: { title: string } }>('/api/circles/c_demo/documents/doc_demo_0')
  expect(result.document.title).toBe('November visit summary')
})
