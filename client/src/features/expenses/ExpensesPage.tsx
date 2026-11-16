import { CircleSelection } from '../circles/CircleSelection.tsx'
import { circleLink, useCircleSelection } from '../circles/selection.ts'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { CircleSummary, Expense, ExpenseCategory } from '../../api/types.ts'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { TextField } from '../../components/ui/Field.tsx'
import { Logo } from '../../components/ui/Logo.tsx'
import { useLogout, useRequiredSession } from '../auth/session.ts'
import { useExpenses } from '../care/queries.ts'
import { formatMoney } from '../home/dashboard.ts'
import { useCreateExpense, useDeleteExpense, useUpdateExpense } from './mutations.ts'
import { createExpenseSchema } from './schemas.ts'

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
    <label className="grid gap-2 font-medium">
      {label}
      <select
        aria-label={label}
        className="min-w-0 rounded-control border border-line-strong bg-surface px-3 py-3 text-body"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  )
}
function ExpenseForm({
  circle,
  expense,
  onClose,
}: {
  circle: CircleSummary
  expense: Expense | null
  onClose: (saved: boolean) => void
}) {
  const create = useCreateExpense(circle.id)
  const update = useUpdateExpense(circle.id)
  const [description, setDescription] = useState(expense?.description ?? '')
  const [amount, setAmount] = useState(expense ? (expense.amountCents / 100).toFixed(2) : '')
  const [recipientId, setRecipientId] = useState(expense?.recipientId ?? circle.recipients[0]?.id ?? '')
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'other')
  const [today] = useState(() => dateString(new Date()))
  const [date, setDate] = useState(() => expense?.incurredOn ?? today)
  const [error, setError] = useState('')
  const pending = create.isPending || update.isPending
  async function submit(event: FormEvent) {
    event.preventDefault()
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
    try {
      if (expense) await update.mutateAsync({ expenseId: expense.id, body: parsed.data })
      else await create.mutateAsync(parsed.data)
      onClose(true)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }
  return (
    <form onSubmit={submit} className={panel} aria-label={expense ? 'Edit expense' : 'Add expense'}>
      <h2 className="mb-5 font-display text-h2 font-semibold">{expense ? 'Edit expense' : 'Add expense'}</h2>
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
        <Select label="Care recipient" value={recipientId} onChange={setRecipientId}>
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
  )
}
function CircleExpenses({ circle }: { circle: CircleSummary }) {
  const [months, setMonths] = useState('1')
  const [recipientId, setRecipientId] = useState('')
  const [category, setCategory] = useState('')
  const [editor, setEditor] = useState<Expense | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const remove = useDeleteExpense(circle.id)
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-h1 font-bold">Care expenses</h1>
          <p className="mt-2 text-muted">Keep track of what caring costs.</p>
        </div>
        <Button
          disabled={editor !== undefined || !circle.recipients.length}
          onClick={() => {
            setNotice('')
            setEditor(null)
          }}
        >
          + Add expense
        </Button>
      </div>
      {!circle.recipients.length && <Alert>Add a care recipient before recording expenses.</Alert>}
      {editor !== undefined && (
        <ExpenseForm
          key={editor?.id ?? 'new'}
          circle={circle}
          expense={editor}
          onClose={(saved) => {
            setEditor(undefined)
            if (saved) setNotice('Expense saved. The list shows expenses matching your filters.')
          }}
        />
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Select label="Period" value={months} onChange={setMonths}>
          <option value="1">This month</option>
          <option value="6">Last 6 months</option>
          <option value="12">Last 12 months</option>
        </Select>
        <Select label="Filter by recipient" value={recipientId} onChange={setRecipientId}>
          <option value="">Everyone</option>
          {circle.recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <Select label="Filter by category" value={category} onChange={setCategory}>
          <option value="">All categories</option>
          {Object.entries(categories).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      {query.isPending ? (
        <p role="status">Loading expenses…</p>
      ) : query.isError ? (
        <Alert tone="danger">
          {errorMessage(query.error)}{' '}
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </Alert>
      ) : (
        <>
          <section className={`${panel} grid gap-8 md:grid-cols-[1fr_2fr]`} aria-label="Spending summary">
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
            <h2 className="mb-4 font-display text-h2 font-semibold">Recorded expenses</h2>
            {!expenses.length && (
              <p className="py-6 text-muted">No expenses match these filters. Add an expense or change your filters.</p>
            )}
            <ul className="divide-y divide-line">
              {expenses.map((expense) => (
                <li key={expense.id} className="py-5">
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
                        variant="secondary"
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
                        variant="secondary"
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
                    <div className="mt-4 space-y-3 rounded-control bg-wash p-4">
                      <p>Delete “{expense.description}”? This cannot be undone.</p>
                      {remove.isError && <Alert tone="danger">{errorMessage(remove.error)}</Alert>}
                      <div className="flex gap-3">
                        <Button
                          loading={remove.isPending}
                          onClick={async () => {
                            try {
                              await remove.mutateAsync(expense.id)
                              setDeleting(null)
                              if (editor?.id === expense.id) setEditor(undefined)
                              setNotice('Expense deleted.')
                            } catch {
                              /* Error is displayed above. */
                            }
                          }}
                        >
                          Confirm delete
                        </Button>
                        <Button variant="secondary" disabled={remove.isPending} onClick={() => setDeleting(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
export function ExpensesPage() {
  const { circles } = useRequiredSession()
  const logout = useLogout()
  const { circle, selectCircle } = useCircleSelection(circles)
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Logo />
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-2">
            <Link className="rounded-control px-3 py-2 hover:bg-wash" to={circleLink('/app', circle?.id)}>
              Overview
            </Link>
            <Link className="rounded-control px-3 py-2 hover:bg-wash" to="/app/appointments">
              Care
            </Link>
            <Link
              className="rounded-control bg-wash px-3 py-2 font-semibold text-primary"
              aria-current="page"
              to={circleLink('/app/expenses', circle?.id)}
            >
              Expenses
            </Link>
            <span className="px-3 py-2 text-muted">Documents · soon</span>
          </nav>
          <Button variant="secondary" loading={logout.isPending} onClick={() => logout.mutate()}>
            Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-8">
        <CircleSelection circles={circles} circle={circle} onChange={selectCircle} />
        {circle ? (
          <CircleExpenses key={circle.id} circle={circle} />
        ) : (
          <section className={panel}>
            <h1 className="font-display text-h1 font-bold">Care expenses</h1>
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
