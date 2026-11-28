import { QueryFeedback } from '../../components/ui/QueryFeedback.tsx'
import { useCareSelection } from '../care/selection.ts'
import { CareProfileSelection } from '../care/CareProfileSelection.tsx'
import { CircleSelection } from '../circles/CircleSelection.tsx'
import { useCircleSelection } from '../circles/selection.ts'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { CircleSummary, Expense, ExpenseCategory } from '../../api/types.ts'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { SelectField, TextField } from '../../components/ui/Field.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { useExpenses } from '../care/queries.ts'
import { formatMoney } from '../home/dashboard.ts'
import { useCreateExpense, useDeleteExpense, useUpdateExpense } from './mutations.ts'
import { createExpenseSchema } from './schemas.ts'

import { PageHeader } from '../../components/ui/PageHeader.tsx'
import { FeatureToolbar } from '../../components/ui/FeatureToolbar.tsx'
import { FormDialog } from '../../components/ui/FormDialog.tsx'

const categories: Record<ExpenseCategory, string> = {
  medication: 'Medication',
  appointment: 'Appointments',
  insurance: 'Insurance',
  utilities: 'Utilities',
  other: 'Other',
}
const panel = 'rounded-panel border border-line bg-surface p-5 sm:p-6'
function dateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function Select({
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
    <SelectField label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {children}
    </SelectField>
  )
}
export function ExpenseForm({
  circle,
  expense,
  onClose,
  initialRecipientId,
}: {
  circle: CircleSummary
  expense: Expense | null
  initialRecipientId?: string
  onClose: (saved: boolean) => void
}) {
  const create = useCreateExpense(circle.id)
  const update = useUpdateExpense(circle.id)
  const [description, setDescription] = useState(expense?.description ?? '')
  const [amount, setAmount] = useState(expense ? (expense.amountCents / 100).toFixed(2) : '')
  const [recipientId, setRecipientId] = useState(
    expense?.recipientId ?? initialRecipientId ?? circle.recipients[0]?.id ?? '',
  )
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'other')
  const [today] = useState(() => dateString(new Date()))
  const [date, setDate] = useState(() => expense?.incurredOn ?? today)
  const [error, setError] = useState('')
  const saving = useRef(false)
  const pending = create.isPending || update.isPending
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving.current) return
    const parsed = createExpenseSchema.safeParse({
      description,
      recipientId,
      category,
      amountCents: Math.round(Number(amount) * 100),
      currency: 'USD',
      incurredOn: date,
    })
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || !parsed.success) {
      setError(
        (!parsed.success && parsed.error.issues.find((issue) => issue.path[0] === 'incurredOn')?.message) ||
          'Enter a description, recipient, valid date, and positive USD amount with at most two decimal places.',
      )
      return
    }
    setError('')
    saving.current = true
    try {
      if (expense) await update.mutateAsync({ expenseId: expense.id, body: parsed.data })
      else await create.mutateAsync(parsed.data)
      onClose(true)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      saving.current = false
    }
  }
  return (
    <FormDialog
      isBusy={() => saving.current}
      title={expense ? 'Edit expense' : 'Add expense'}
      busy={pending}
      onClose={() => onClose(false)}
    >
      <form onSubmit={submit} aria-label={expense ? 'Edit expense' : 'Add expense'}>
        <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
          <TextField
            autoFocus
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={200}
          />
          <TextField
            label="Amount (USD)"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="0.00"
          />
          <Select label="Care profile" value={recipientId} onChange={setRecipientId}>
            {circle.recipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Select label="Category" value={category} onChange={(v) => setCategory(v as ExpenseCategory)}>
            {Object.entries(categories).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <TextField
            label="Expense date"
            type="date"
            max={today}
            hint="Today or earlier (UTC)."
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </fieldset>
        {error && (
          <div className="mt-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        <div className="mt-5 flex gap-3">
          <Button type="submit" loading={pending}>
            Save expense
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => onClose(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}
function CircleExpenses({ circle }: { circle: CircleSummary }) {
  const [months, setMonths] = useState('1')
  const { recipientId, setRecipientId, resetFilters } = useCareSelection(circle)
  const [category, setCategory] = useState('')
  const [editor, setEditor] = useState<Expense | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const remove = useDeleteExpense(circle.id)
  const deletingNow = useRef(false)
  const [now] = useState(() => new Date())
  const fromDate = dateString(new Date(now.getFullYear(), now.getMonth() - Number(months) + 1, 1))
  const toDate = dateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const query = useExpenses(circle.id, {
    fromDate,
    toDate,
    recipientId: recipientId || undefined,
    category: (category || undefined) as ExpenseCategory | undefined,
  })
  const expenses = query.data ?? []
  const total = expenses.reduce((sum, item) => sum + item.amountCents, 0)
  const period = months === '1' ? 'This month' : `Last ${months} months`
  return (
    <section className={panel}>
      {!circle.recipients.length && <Alert>Add a care recipient before recording expenses.</Alert>}
      {editor !== undefined && (
        <ExpenseForm
          key={editor?.id ?? 'new'}
          circle={circle}
          expense={editor}
          initialRecipientId={recipientId || undefined}
          onClose={(saved) => {
            setEditor(undefined)
            if (saved) setNotice('Expense saved. Clear filters if it is not shown.')
          }}
        />
      )}
      <FeatureToolbar
        onClear={() => {
          resetFilters()
          setMonths('1')
          setCategory('')
        }}
        actions={
          <Button
            disabled={editor !== undefined || !circle.recipients.length}
            onClick={() => {
              setNotice('')
              setEditor(null)
            }}
          >
            Add expense
          </Button>
        }
      >
        <Select label="Period" value={months} onChange={setMonths}>
          <option value="1">This month</option>
          <option value="6">Last 6 months</option>
          <option value="12">Last 12 months</option>
        </Select>
        <CareProfileSelection circle={circle} value={recipientId} onChange={setRecipientId} />
        <Select label="Filter by category" value={category} onChange={setCategory}>
          <option value="">All categories</option>
          {Object.entries(categories).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </FeatureToolbar>
      {notice && <Alert tone="success">{notice}</Alert>}
      {query.isPending || query.isError ? (
        <QueryFeedback query={query} loading="Loading expenses…" />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <section className={`${panel} grid gap-5`} aria-label="Spending summary">
            <div>
              <p className="text-muted">{period} · filtered total</p>
              <p className="mt-3 font-display text-h1 font-bold">{formatMoney(total)}</p>
              <p className="mt-2 text-muted">{expenses.length} recorded expenses · USD</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {Object.entries(categories).map(([key, label]) => {
                const subtotal = expenses.filter((e) => e.category === key).reduce((sum, e) => sum + e.amountCents, 0)
                return (
                  <div key={key}>
                    <div className="mb-2 flex justify-between gap-3">
                      <span>{label}</span>
                      <span className="font-semibold">{formatMoney(subtotal)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-wash" aria-hidden>
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${total ? (subtotal / total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
          <section className={panel} aria-label="Recorded expenses">
            <h2 className="mb-4 font-display text-h3 font-semibold">Recorded expenses</h2>
            {!expenses.length && (
              <p className="py-6 text-muted">No expenses match these filters. Add an expense or change your filters.</p>
            )}
            <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto pr-2">
              {expenses.map((expense) => (
                <li key={expense.id} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{expense.description}</h3>
                      <p className="mt-1 text-muted">
                        {circle.recipients.find((r) => r.id === expense.recipientId)?.name ?? 'Care recipient'} ·{' '}
                        {categories[expense.category]} ·{' '}
                        {new Date(`${expense.incurredOn}T12:00:00`).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{formatMoney(expense.amountCents)}</span>
                      <Button
                        variant="outline"
                        disabled={editor !== undefined || remove.isPending}
                        aria-label={`Edit ${expense.description}`}
                        onClick={() => {
                          setNotice('')
                          setEditor(expense)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        disabled={remove.isPending}
                        aria-label={`Delete ${expense.description}`}
                        onClick={() => {
                          remove.reset()
                          setDeleting(expense.id)
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {deleting === expense.id && (
                    <FormDialog
                      title="Delete expense?"
                      isBusy={() => deletingNow.current}
                      busy={remove.isPending}
                      onClose={() => setDeleting(null)}
                    >
                      <p className="mb-4">Delete “{expense.description}”? This cannot be undone.</p>
                      {remove.isError && <Alert tone="danger">{errorMessage(remove.error)}</Alert>}
                      <div className="flex gap-3">
                        <Button
                          variant="danger"
                          loading={remove.isPending}
                          onClick={async () => {
                            if (deletingNow.current) return
                            deletingNow.current = true
                            try {
                              await remove.mutateAsync(expense.id)
                              setDeleting(null)
                              if (editor?.id === expense.id) setEditor(undefined)
                              setNotice('Expense deleted.')
                            } catch {
                              /* Error is displayed above. */
                            } finally {
                              deletingNow.current = false
                            }
                          }}
                        >
                          Delete expense
                        </Button>
                        <Button variant="secondary" disabled={remove.isPending} onClick={() => setDeleting(null)}>
                          Cancel
                        </Button>
                      </div>
                    </FormDialog>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </section>
  )
}
/** Rendered inside AppLayout, which supplies the shared header and navigation. */
export function ExpensesPage() {
  const { circles } = useRequiredSession()
  const { circle, selectCircle } = useCircleSelection(circles)
  return (
    <div className="min-h-dvh">
      <main className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
        <PageHeader
          title="Care expenses"
          description="Keep track of what caring costs."
          aside={<CircleSelection circles={circles} circle={circle} onChange={selectCircle} />}
        />
        {circle ? (
          <CircleExpenses key={circle.id} circle={circle} />
        ) : (
          <section className={panel}>
            <p className="mt-3 text-muted">
              {circles.length
                ? 'Choose an available circle above to view its expenses.'
                : 'Create or join a care circle to track expenses.'}
            </p>
          </section>
        )}
      </main>
    </div>
  )
}
