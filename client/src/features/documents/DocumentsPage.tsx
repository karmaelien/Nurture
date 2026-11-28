import { QueryFeedback } from '../../components/ui/QueryFeedback.tsx'
import { useCareSelection } from '../care/selection.ts'
import { CareProfileSelection } from '../care/CareProfileSelection.tsx'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Lock, Users } from 'lucide-react'
import type { CareDocument, CircleDetail, CircleSummary } from '../../api/types.ts'
import { circlesApi } from '../../api/circles.ts'
import { documentsApi } from '../../api/documents.ts'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { TextField } from '../../components/ui/Field.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { CircleSelection } from '../circles/CircleSelection.tsx'
import { useCircleSelection } from '../circles/selection.ts'
import { mocksEnabled } from '../../mocks/enabled.ts'
import { DocumentForm, DocumentSelect } from './DocumentForm.tsx'
import { documentCategories } from './schemas.ts'

import { PageHeader } from '../../components/ui/PageHeader.tsx'
import { FeatureToolbar } from '../../components/ui/FeatureToolbar.tsx'
import { FormDialog } from '../../components/ui/FormDialog.tsx'

const panel = 'min-w-0 rounded-panel border border-line bg-surface p-5 sm:p-6'
const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
function FilePreview({ circleId, document }: { circleId: string; document: CareDocument }) {
  const { user } = useRequiredSession()
  const file = useQuery({
    queryKey: ['documents-file', user.id, circleId, document.id],
    queryFn: () => documentsApi.file(circleId, document.id),
    retry: false,
    gcTime: 0,
  })
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!file.data) return
    const objectUrl = URL.createObjectURL(file.data)
    // Object URLs are external browser resources and must be created/revoked in an effect.
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file.data])
  if (file.isPending || file.isError) return <QueryFeedback query={file} loading="Loading preview…" />
  return (
    <div className="space-y-3">
      {url &&
        (document.mimeType === 'application/pdf' ? (
          <iframe
            src={url}
            title={`Preview of ${document.title}`}
            className="h-80 w-full rounded-control border border-line bg-wash"
          />
        ) : (
          <img src={url} alt={document.title} className="max-h-80 w-full rounded-control bg-wash object-contain" />
        ))}
      <p className="text-small text-muted">If the preview is unavailable in your browser, open or download the file.</p>
      {url && (
        <div className="flex flex-wrap gap-4">
          <a href={url} target="_blank" rel="noreferrer" className="link">
            Open document
          </a>
          <a href={url} download={document.fileName} className="link">
            Download original
          </a>
        </div>
      )}
    </div>
  )
}
function DocumentDetails({
  document,
  circle,
  refresh,
  onDeleted,
  onSaved,
}: {
  document: CareDocument
  circle: CircleDetail
  refresh: () => Promise<void>
  onDeleted: () => void
  onSaved: () => void
}) {
  const { user } = useRequiredSession()
  const cache = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [editingBusy, setEditingBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const writing = useRef(false)
  async function remove() {
    if (writing.current) return
    writing.current = true
    setPending(true)
    setError('')
    try {
      await documentsApi.remove(circle.id, document.id)
      cache.removeQueries({ queryKey: ['documents-file', user.id, circle.id, document.id] })
      await refresh()
      onDeleted()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      writing.current = false
      setPending(false)
    }
  }
  return (
    <aside className={`${panel} self-start`} aria-label="Document details">
      <p className="mb-2 text-small text-muted">DOCUMENT DETAILS</p>
      <h2 className="break-words font-display text-h2 font-semibold">{document.title}</h2>
      <p className="mb-5 mt-2 text-muted">
        {circle.recipients.find((r) => r.id === document.recipientId)?.name} · {documentCategories[document.category]}
      </p>
      <FilePreview circleId={circle.id} document={document} />
      <p className="mt-4 break-words text-small text-muted">
        {document.fileName} · {size(document.sizeBytes)}
        <br />
        Uploaded {new Date(document.uploadedAt).toLocaleDateString()} by{' '}
        {circle.members.find((m) => m.user.id === document.uploadedBy)?.user.name ?? 'Former member'}
      </p>
      <div className="mt-6 border-t border-line pt-5">
        {editing ? (
          <FormDialog
            title="Edit document"
            isBusy={() => writing.current}
            busy={editingBusy}
            onClose={() => setEditing(false)}
          >
            <DocumentForm
              onPendingChange={(busy) => {
                writing.current = busy
                setEditingBusy(busy)
              }}
              document={document}
              circle={circle}
              userId={user.id}
              cancel={() => setEditing(false)}
              save={async ({ title, category, sharing }, _file, version) => {
                if (version === undefined) throw new Error('Reload the document before editing.')
                await documentsApi.update(circle.id, document.id, { title, category, sharing, version })
                await refresh()
                setEditing(false)
                onSaved()
              }}
            />
          </FormDialog>
        ) : (
          <>
            <h3 className="font-semibold">Who can access</h3>
            <p className="mt-2">
              {document.sharing.mode === 'circle' ? 'Everyone in this circle' : 'Specific members'}
            </p>
            {document.sharing.mode === 'selected' && (
              <ul className="mt-2 space-y-1 text-muted">
                {circle.members
                  .filter(
                    (m) =>
                      m.role === 'owner' ||
                      m.user.id === document.uploadedBy ||
                      document.sharing.memberIds.some((id) => id === m.user.id),
                  )
                  .map((m) => (
                    <li key={m.user.id}>
                      {m.user.name}
                      {m.role === 'owner' ? ' · Owner' : m.user.id === document.uploadedBy ? ' · Uploader' : ''}
                    </li>
                  ))}
              </ul>
            )}
            <p className="mt-3 text-small text-muted">The uploader and circle owners always have access.</p>
            {document.canManage ? (
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(true)
                    setConfirm(false)
                  }}
                >
                  Edit details & sharing
                </Button>
                <Button variant="danger" onClick={() => setConfirm(true)}>
                  Delete document
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-small text-muted">You have read-only access.</p>
            )}
          </>
        )}
      </div>
      {confirm && (
        <FormDialog
          title="Delete document?"
          isBusy={() => writing.current}
          busy={pending}
          onClose={() => setConfirm(false)}
        >
          <p className="mb-4">Delete “{document.title}”? This removes the file for everyone and cannot be undone.</p>
          {error && (
            <div className="mb-4">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" loading={pending} onClick={() => void remove()}>
              Delete document
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </div>
        </FormDialog>
      )}
      {error && !confirm && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
    </aside>
  )
}
function CircleDocuments({ circle }: { circle: CircleSummary }) {
  const { user } = useRequiredSession()
  const cache = useQueryClient()
  const key = ['documents', user.id, circle.id]
  const documents = useQuery({ queryKey: key, queryFn: () => documentsApi.list(circle.id), retry: false })
  const detail = useQuery({
    queryKey: ['circle', user.id, circle.id],
    queryFn: () => circlesApi.detail(circle.id),
    retry: false,
  })
  const [search, setSearch] = useState('')
  const { recipientId: recipient, setRecipientId: setRecipient, resetFilters } = useCareSelection(circle)
  const [category, setCategory] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [upload, setUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const uploadingNow = useRef(false)
  const [notice, setNotice] = useState('')
  const refresh = () => cache.invalidateQueries({ queryKey: key })
  const visible = (documents.data?.documents ?? []).filter(
    (d) =>
      (!recipient || d.recipientId === recipient) &&
      (category === 'all' || d.category === category) &&
      `${d.title} ${d.fileName}`.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const active = visible.find((d) => d.id === selected) ?? visible[0]
  return (
    <section className={panel}>
      {upload && detail.data && (
        <FormDialog
          title="Upload a document"
          isBusy={() => uploadingNow.current}
          busy={uploading}
          onClose={() => setUpload(false)}
        >
          <DocumentForm
            circle={detail.data.circle}
            userId={user.id}
            initialRecipientId={recipient || undefined}
            onPendingChange={(busy) => {
              uploadingNow.current = busy
              setUploading(busy)
            }}
            cancel={() => setUpload(false)}
            save={async (metadata, file) => {
              const result = await documentsApi.upload(circle.id, file!, metadata)
              await refresh()
              setSelected(result.document.id)
              setUpload(false)
              setNotice('Document uploaded. Clear filters if it is not shown.')
            }}
          />
        </FormDialog>
      )}
      <FeatureToolbar
        onClear={() => {
          resetFilters()
          setSearch('')
          setCategory('all')
        }}
        actions={
          <Button
            disabled={upload || !detail.data || detail.isError || !circle.recipients.length}
            onClick={() => {
              setUpload(true)
              setNotice('')
            }}
          >
            Upload document
          </Button>
        }
      >
        <TextField
          label="Search documents"
          placeholder="Search titles or filenames"
          maxLength={200}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <CareProfileSelection circle={circle} value={recipient} onChange={setRecipient} />
        <DocumentSelect label="Filter by category" value={category} onChange={setCategory}>
          <option value="all">All categories</option>
          {Object.entries(documentCategories).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </DocumentSelect>
      </FeatureToolbar>
      {notice && <Alert tone="success">{notice}</Alert>}
      {mocksEnabled && (
        <p className="mb-4 text-small text-muted">
          Demo documents — uploads and changes are temporary and reset when you reload. Use sample files only.
        </p>
      )}
      {documents.isPending || detail.isPending || documents.isError || detail.isError ? (
        <QueryFeedback
          loading="Loading documents…"
          query={{
            isPending: documents.isPending || detail.isPending,
            isError: documents.isError || detail.isError,
            error: documents.error ?? detail.error,
            refetch: () => Promise.all([documents.refetch(), detail.refetch()]),
          }}
        />
      ) : (
        <>
          <p className="mb-4 text-small text-muted" role="status">
            {visible.length} documents · Only documents you can access are shown
          </p>
          {!visible.length ? (
            <section className={panel}>
              <h2 className="font-display text-h2 font-semibold">No documents found</h2>
              <p className="mt-2 text-muted">Upload a document or change your search and filters.</p>
            </section>
          ) : (
            <div className="grid items-start gap-5 lg:grid-cols-2">
              <ul className="max-h-[38rem] min-w-0 self-start overflow-y-auto rounded-panel border border-line bg-surface">
                {visible.map((d) => (
                  <li key={d.id} className="border-b border-line last:border-0">
                    <button
                      type="button"
                      aria-pressed={active?.id === d.id}
                      onClick={() => setSelected(d.id)}
                      className={`flex w-full items-start gap-4 p-5 text-left transition-colors hover:bg-wash ${active?.id === d.id ? 'bg-wash ring-inset ring-2 ring-primary' : ''}`}
                    >
                      <FileText className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0">
                        <span className="block break-words font-semibold">{d.title}</span>
                        <span className="mt-1 block text-small text-muted">
                          {circle.recipients.find((r) => r.id === d.recipientId)?.name} ·{' '}
                          {documentCategories[d.category]}
                        </span>
                        <span className="mt-1 block text-small text-muted">
                          {new Date(d.uploadedAt).toLocaleDateString()} · {size(d.sizeBytes)}
                        </span>
                        <span className="mt-3 inline-flex items-center gap-2 rounded-control border border-line px-2 py-1 text-small">
                          {d.sharing.mode === 'circle' ? (
                            <Users className="size-4" aria-hidden />
                          ) : (
                            <Lock className="size-4" aria-hidden />
                          )}
                          {d.sharing.mode === 'circle' ? 'Everyone' : 'Selected members'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {active && detail.data && (
                <DocumentDetails
                  key={active.id}
                  document={active}
                  circle={detail.data.circle}
                  refresh={refresh}
                  onSaved={() => setNotice('Document saved. Clear filters if it is not shown.')}
                  onDeleted={() => {
                    setSelected(null)
                    setNotice('Document deleted.')
                  }}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
export function DocumentsPage() {
  const { circles } = useRequiredSession()
  const { circle, selectCircle } = useCircleSelection(circles)
  return (
    <div className="min-h-dvh">
      <main className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
        <PageHeader
          title="Care documents"
          description="The important details, all in one place."
          aside={<CircleSelection circles={circles} circle={circle} onChange={selectCircle} />}
        />
        {circle ? (
          <CircleDocuments key={circle.id} circle={circle} />
        ) : (
          <p>Select an available care circle to view its documents.</p>
        )}
      </main>
    </div>
  )
}
