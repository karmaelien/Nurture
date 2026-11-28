import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import type {
  CareDocument,
  CircleDetail,
  CreateDocumentRequest,
  DocumentCategory,
  DocumentSharing,
} from '../../api/types.ts'
import { Button } from '../../components/ui/Button.tsx'
import { SelectField, TextField } from '../../components/ui/Field.tsx'
import { Alert } from '../../components/ui/Alert.tsx'
import { errorMessage } from '../../api/client.ts'
import { createDocumentSchema, documentCategories, documentFileError } from './schemas.ts'

export function DocumentSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <SelectField label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {children}
    </SelectField>
  )
}
export function DocumentForm({
  circle,
  userId,
  document,
  save,
  cancel,
  onPendingChange,
}: {
  circle: CircleDetail
  userId: string
  document?: CareDocument
  save: (metadata: CreateDocumentRequest, file?: File, version?: number) => Promise<void>
  cancel: () => void
  onPendingChange?: (pending: boolean) => void
}) {
  // Keep the version of the form snapshot even if query data refreshes behind it.
  const [version] = useState(document?.version)
  const [title, setTitle] = useState(document?.title ?? '')
  const [recipientId, setRecipientId] = useState(document?.recipientId ?? circle.recipients[0]?.id ?? '')
  const [category, setCategory] = useState<DocumentCategory>(document?.category ?? 'medical')
  const [sharing, setSharing] = useState<DocumentSharing>(document?.sharing ?? { mode: 'selected', memberIds: [] })
  const [file, setFile] = useState<File>()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const saving = useRef(false)
  const uploaderId = document?.uploadedBy ?? userId
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving.current) return
    const parsed = createDocumentSchema.safeParse({ title, recipientId, category, sharing })
    if (!parsed.success) {
      setError('Enter a title, recipient, category, and sharing choice.')
      return
    }
    if (!document) {
      const problem = file ? documentFileError(file) : 'Choose a file to upload.'
      if (problem) {
        setError(problem)
        return
      }
    }
    setError('')
    saving.current = true
    setPending(true)
    onPendingChange?.(true)
    try {
      await save(parsed.data, file, version)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      saving.current = false
      setPending(false)
      onPendingChange?.(false)
    }
  }
  return (
    <form onSubmit={submit} aria-label={document ? 'Edit document' : 'Upload document'} className="space-y-4">
      <fieldset disabled={pending} className="grid gap-4">
        {!document && (
          <label className="grid gap-2">
            File
            <input
              aria-label="File"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="max-w-full rounded-control border border-field p-2"
              onChange={(e) => {
                const chosen = e.target.files?.[0]
                setFile(chosen)
                if (!title && chosen) setTitle(chosen.name.replace(/\.[^.]+$/, ''))
              }}
            />
            <span className="text-small text-muted">PDF, JPEG, or PNG · Maximum 10 MiB</span>
          </label>
        )}
        <TextField
          label="Document title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
        />
        {!document && (
          <DocumentSelect label="Document recipient" value={recipientId} onChange={setRecipientId}>
            {circle.recipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </DocumentSelect>
        )}
        <DocumentSelect
          label="Document category"
          value={category}
          onChange={(value) => setCategory(value as DocumentCategory)}
        >
          {Object.entries(documentCategories).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </DocumentSelect>
        <DocumentSelect
          label="Who can access"
          value={sharing.mode}
          onChange={(mode) =>
            setSharing(mode === 'circle' ? { mode: 'circle', memberIds: [] } : { mode: 'selected', memberIds: [] })
          }
        >
          <option value="selected">Specific members</option>
          <option value="circle">Everyone in this circle</option>
        </DocumentSelect>
        {sharing.mode === 'selected' && (
          <fieldset className="space-y-3">
            <legend className="mb-2 text-muted">Members with access</legend>
            {circle.members.map((m) => {
              const automatic = m.role === 'owner' || m.user.id === uploaderId
              return (
                <label key={m.user.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={automatic || sharing.memberIds.includes(m.user.id)}
                    disabled={automatic}
                    onChange={(e) =>
                      setSharing({
                        mode: 'selected',
                        memberIds: e.target.checked
                          ? [...sharing.memberIds, m.user.id]
                          : sharing.memberIds.filter((id) => id !== m.user.id),
                      })
                    }
                  />
                  {m.user.name}
                  {automatic && (
                    <span className="text-small text-muted">{m.role === 'owner' ? '(owner)' : '(uploader)'}</span>
                  )}
                </label>
              )
            })}
          </fieldset>
        )}
        <p className="text-small text-muted">The uploader and circle owners always have access.</p>
      </fieldset>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending}>
          {document ? 'Save changes' : 'Upload document'}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
