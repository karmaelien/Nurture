import { HttpResponse } from 'msw'
import catalog from '../../../nurture-api/src/data/assistance-resources.json'
import type { AssistanceReport, AssistanceResource } from '../api/types.ts'
import {
  assistanceInputSchema,
  assistanceNotificationSchema,
  assistanceQuerySchema,
} from '../features/assistance/schemas.ts'
import { http } from './http.ts'
import { readDb, writeDb } from './db.ts'
import { bearerToken, error, unauthorized } from './responses.ts'

const resources = catalog as AssistanceResource[]
const notFound = () => error(404, 'not_found', 'This medication, assistance report, or care circle is unavailable.')
function scope(request: Request, circleId: string) {
  const db = readDb()
  const token = bearerToken(request)
  const userId = token ? db.sessions[token] : undefined
  if (!userId || !db.users.some((user) => user.id === userId)) return { failure: unauthorized() }
  const circle = db.circles.find(
    (item) => item.id === circleId && item.members.some((member) => member.user.id === userId),
  )
  if (!circle) return { failure: notFound() }
  return { db, circle, userId }
}
const path = '/api/circles/:circleId/assistance-reports'
export const assistanceHandlers = [
  http.get(`${path}/:reportId`, ({ request, params }) => {
    const context = scope(request, String(params.circleId))
    if (context.failure) return context.failure
    const { db, circle } = context
    const report = db.assistanceReports?.find(
      (item) =>
        item.id === params.reportId &&
        item.circleId === circle.id &&
        circle.recipients.some((person) => person.id === item.recipientId),
    )
    return report ? HttpResponse.json({ report, resources }) : notFound()
  }),
  http.get(path, ({ request, params }) => {
    const context = scope(request, String(params.circleId))
    if (context.failure) return context.failure
    const { db, circle } = context
    const query = new URL(request.url).searchParams
    const parsed = assistanceQuerySchema.safeParse(Object.fromEntries(query))
    if (!parsed.success || [...query.keys()].some((key) => query.getAll(key).length !== 1))
      return error(400, 'validation_error', 'Provide valid assistance filters.')
    const { recipientId, status, cursor } = parsed.data
    if (recipientId && !circle.recipients.some((person) => person.id === recipientId)) return notFound()
    const matching = (db.assistanceReports ?? [])
      .filter(
        (report) =>
          report.circleId === circle.id &&
          circle.recipients.some((person) => person.id === report.recipientId) &&
          (!recipientId || report.recipientId === recipientId) &&
          (status === 'all' || (status === 'dismissed' ? !!report.dismissedAt : !report.dismissedAt)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    const [at, id] = cursor?.split('|') ?? []
    const page = matching
      .filter((report) => !at || report.createdAt < at || (report.createdAt === at && report.id < id))
      .slice(0, 51)
    const reports = page.slice(0, 50)
    const last = reports.at(-1)
    return HttpResponse.json({
      reports,
      totalCount: matching.length,
      nextCursor: page.length > 50 && last ? `${last.createdAt}|${last.id}` : null,
      resources,
    })
  }),
  http.post(path, async ({ request, params }) => {
    const body = assistanceInputSchema.safeParse(await request.json().catch(() => null))
    const context = scope(request, String(params.circleId))
    if (context.failure) return context.failure
    if (!body.success) return error(400, 'validation_error', body.error.issues[0].message)
    const { db, circle, userId } = context
    const { requestId, ...input } = body.data
    const signature = JSON.stringify({ userId, circleId: circle.id, ...input })
    const existing = db.assistanceReports?.find((report) => report.id === requestId)
    if (existing) {
      const same =
        existing.circleId === circle.id &&
        existing.reportedBy === userId &&
        db.assistanceRequestKeys?.[requestId] === signature
      return same
        ? HttpResponse.json({ report: existing, resources }, { status: 201 })
        : error(409, 'report_conflict', 'This report request was already used. Reopen the report form.')
    }
    const medication = db.care.medications.find(
      (item) => item.id === input.medicationId && circle.recipients.some((person) => person.id === item.recipientId),
    )
    if (!medication) return notFound()
    const report: AssistanceReport = {
      ...input,
      id: requestId,
      circleId: circle.id,
      medicationName: medication.name,
      recipientId: medication.recipientId,
      createdAt: new Date().toISOString(),
      reportedBy: userId,
      dismissedAt: null,
      version: 1,
    }
    db.assistanceReports ??= []
    db.assistanceReports.push(report)
    db.assistanceRequestKeys ??= {}
    db.assistanceRequestKeys[requestId] = signature
    writeDb(db)
    return HttpResponse.json({ report, resources }, { status: 201 })
  }),
  http.patch(`${path}/:reportId/notification`, async ({ request, params }) => {
    const body = assistanceNotificationSchema.safeParse(await request.json().catch(() => null))
    const context = scope(request, String(params.circleId))
    if (context.failure) return context.failure
    if (!body.success) return error(400, 'validation_error', 'Provide a notification state and version.')
    const { db, circle } = context
    const report = db.assistanceReports?.find(
      (item) =>
        item.id === params.reportId &&
        item.circleId === circle.id &&
        circle.recipients.some((person) => person.id === item.recipientId),
    )
    if (!report) return notFound()
    if (report.version !== body.data.version)
      return error(409, 'edit_conflict', 'This notification changed. Review the refreshed list before trying again.')
    if (!!report.dismissedAt !== body.data.dismissed) {
      report.dismissedAt = body.data.dismissed ? new Date().toISOString() : null
      report.version++
      writeDb(db)
    }
    return HttpResponse.json({ report })
  }),
]
