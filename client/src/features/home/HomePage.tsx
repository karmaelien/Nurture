import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Files, LayoutDashboard, ListChecks, Pill, Wallet } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { circlesApi } from '../../api/circles.ts'
import { errorMessage } from '../../api/client.ts'
import type { CircleSummary, ExpenseCategory } from '../../api/types.ts'
import { Button } from '../../components/ui/Button.tsx'
import { buttonClasses } from '../../components/ui/buttonClasses.ts'
import { Logo } from '../../components/ui/Logo.tsx'
import { useLogout, useRequiredSession } from '../auth/session.ts'
import { useAppointments, useExpenses, useMedicationOccurrences, useTasks } from '../care/queries.ts'
import { dashboardWindow, formatDate, formatMoney, formatTime } from './dashboard.ts'

const selectClass = 'max-w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-body'
const categoryNames: Record<ExpenseCategory, string> = {
  medication: 'Medication',
  appointment: 'Appointments',
  insurance: 'Insurance',
  utilities: 'Utilities',
  other: 'Other',
}

type QueryState = { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }

function Panel({
  id,
  title,
  icon,
  query,
  empty,
  action,
  children,
}: {
  id: string
  title: string
  icon: ReactNode
  query: QueryState
  empty: boolean
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="min-w-0 scroll-mt-6 rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="font-display text-h3 font-semibold">
          {title}
        </h2>
        <span className="text-primary" aria-hidden>
          {icon}
        </span>
      </div>
      {query.isError ? (
        <div role="alert">
          <p>{errorMessage(query.error)}</p>
          <Button variant="secondary" className="mt-3" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      ) : query.isPending ? (
        <p role="status" className="text-muted">
          Loading…
        </p>
      ) : empty ? (
        <p className="text-muted">Nothing to show for this period.</p>
      ) : (
        children
      )}
      {action && <div className="mt-6">{action}</div>}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-panel bg-wash p-5">
      <p className="text-muted">{label}</p>
      <p className="mt-2 font-display text-h1 font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function CircleDashboard({ circle }: { circle: CircleSummary }) {
  const { user } = useRequiredSession()
  const [recipientId, setRecipientId] = useState('')
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const windowDates = dashboardWindow(now)
  const recipient = recipientId || undefined
  const appointments = useAppointments(circle.id, {
    from: windowDates.from,
    to: windowDates.to,
    recipientId: recipient,
  })
  const medications = useMedicationOccurrences(circle.id, {
    from: windowDates.todayStart,
    to: windowDates.tomorrowStart,
    recipientId: recipient,
  })
  const tasks = useTasks(circle.id, { status: 'pending', dueBefore: windowDates.to, recipientId: recipient })
  const expenses = useExpenses(circle.id, {
    fromDate: windowDates.fromDate,
    toDate: windowDates.toDate,
    recipientId: recipient,
  })
  const details = useQuery({
    queryKey: ['circle', user.id, circle.id],
    queryFn: () => circlesApi.detail(circle.id),
    retry: false,
  })
  const name = (id: string) => circle.recipients.find((person) => person.id === id)?.name ?? 'Care recipient'
  const assigned = (id: string | null) =>
    id === null
      ? 'Unassigned'
      : (details.data?.circle.members.find((member) => member.user.id === id)?.user.name ??
        (details.isError ? 'Caregiver unavailable' : 'Loading caregiver…'))
  const total = expenses.data?.reduce((sum, expense) => sum + expense.amountCents, 0) ?? 0
  const categories = Object.entries(categoryNames)
    .map(([category, label]) => ({
      label,
      amount:
        expenses.data
          ?.filter((expense) => expense.category === category)
          .reduce((sum, expense) => sum + expense.amountCents, 0) ?? 0,
    }))
    .filter((category) => category.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const count = (query: QueryState & { data?: unknown[] }) =>
    query.isError ? 'Unavailable' : query.isPending ? '…' : String(query.data?.length ?? 0)

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <p className="text-muted">
          {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <label className="grid gap-2">
          Showing
          <select
            aria-label="Showing"
            className={selectClass}
            value={recipientId}
            onChange={(event) => setRecipientId(event.target.value)}
          >
            <option value="">Everyone</option>
            {circle.recipients.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Outstanding tasks · next 7 days + overdue" value={count(tasks)} />
        <Stat
          label="Today’s doses completed"
          value={
            medications.isError
              ? 'Unavailable'
              : medications.isPending
                ? '…'
                : `${medications.data?.filter((dose) => dose.status === 'completed').length ?? 0} / ${medications.data?.length ?? 0}`
          }
        />
        <Stat label="Upcoming appointments · next 7 days" value={count(appointments)} />
      </div>
      {details.isError && (
        <div role="alert" className="mb-6 flex flex-wrap items-center gap-3">
          <p>Caregiver names could not load.</p>
          <Button variant="secondary" onClick={() => details.refetch()}>
            Retry caregiver names
          </Button>
        </div>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel id="tasks" title="Tasks to take care of" icon={<ListChecks />} query={tasks} empty={!tasks.data?.length}>
          <ul className="divide-y divide-line">
            {tasks.data?.map((task) => (
              <li key={task.id} className="py-4 first:pt-0 last:pb-0">
                <p className="font-semibold">{task.title}</p>
                <p className="text-muted">
                  {name(task.recipientId)} · {assigned(task.assignedCaregiverId)}
                </p>
                <p className="mt-2">
                  {task.dueAt
                    ? `${Date.parse(task.dueAt) < now.getTime() ? 'Overdue · ' : ''}${formatDate(task.dueAt)} · ${formatTime(task.dueAt)}`
                    : 'No due date'}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          id="medications"
          title="Today’s medications"
          icon={<Pill />}
          query={medications}
          empty={!medications.data?.length}
        >
          <ul className="divide-y divide-line">
            {medications.data?.map((dose) => (
              <li key={dose.id} className="py-4 first:pt-0 last:pb-0">
                <p className="font-semibold">
                  {formatTime(dose.scheduledAt)} · {name(dose.recipientId)}
                </p>
                <p className="text-muted">
                  {dose.name} · {dose.dosage}
                </p>
                <span className="mt-2 inline-block rounded-control border border-line px-2 py-1">
                  {dose.status === 'completed' ? 'Completed' : 'Pending'}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          id="appointments"
          title="Appointments · next 7 days"
          icon={<CalendarDays />}
          query={appointments}
          empty={!appointments.data?.length}
        >
          <ul className="divide-y divide-line">
            {appointments.data?.map((appointment) => (
              <li key={appointment.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                <div className="h-fit min-w-14 rounded-control bg-wash p-2 text-center" aria-hidden>
                  <p>{new Date(appointment.startsAt).toLocaleDateString(undefined, { weekday: 'short' })}</p>
                  <p className="font-semibold">{new Date(appointment.startsAt).getDate()}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">{appointment.title}</p>
                  <p>
                    {name(appointment.recipientId)} · {formatDate(appointment.startsAt)} ·{' '}
                    {formatTime(appointment.startsAt)}
                  </p>
                  <p className="text-muted">
                    {appointment.location ?? 'Location not set'} · {assigned(appointment.assignedCaregiverId)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          id="expenses"
          title="Care spending"
          icon={<Wallet />}
          query={expenses}
          empty={!expenses.data?.length}
          action={
            <Link to="/app/expenses" className={buttonClasses({ variant: 'secondary' })}>
              View all expenses
            </Link>
          }
        >
          <p className="text-muted">{now.toLocaleDateString(undefined, { month: 'long' })} to date</p>
          <p className="mb-6 mt-1 font-display text-display font-semibold tabular-nums">{formatMoney(total)}</p>
          {categories.map(({ label, amount }) => (
            <div key={label} className="mb-4">
              <div className="flex justify-between gap-3">
                <span>{label}</span>
                <span className="tabular-nums">{formatMoney(amount)}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-wash" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${(amount / total) * 100}%` }} />
              </div>
            </div>
          ))}
          <p className="mt-6 text-muted">{expenses.data?.length} recorded expenses · USD</p>
        </Panel>
      </div>
    </>
  )
}

export function HomePage() {
  const { user, circles } = useRequiredSession()
  const logout = useLogout()
  const [selectedCircle, setSelectedCircle] = useState('')
  const circle = circles.find((item) => item.id === selectedCircle) ?? circles[0]
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Logo />
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-2">
            <a
              href="#overview"
              aria-current="page"
              className="inline-flex items-center gap-2 rounded-control bg-wash px-3 py-2 font-semibold text-primary"
            >
              <LayoutDashboard className="size-5" aria-hidden />
              Overview
            </a>
            {circle && (
              <>
                <a href="#tasks" className="inline-flex items-center gap-2 rounded-control px-3 py-2 hover:bg-wash">
                  <CalendarDays className="size-5" aria-hidden />
                  Care
                </a>
                <Link
                  to="/app/expenses"
                  className="inline-flex items-center gap-2 rounded-control px-3 py-2 hover:bg-wash"
                >
                  <Wallet className="size-5" aria-hidden />
                  Expenses
                </Link>
              </>
            )}
            <span className="inline-flex items-center gap-2 px-3 py-2 text-muted">
              <Files className="size-5" aria-hidden />
              Documents · soon
            </span>
          </nav>
          <Button variant="secondary" loading={logout.isPending} onClick={() => logout.mutate()}>
            Log out
          </Button>
        </div>
      </header>
      <main id="overview" className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-5">
          <div>
            <h1 className="font-display text-h1 font-bold">A little clarity for your day.</h1>
            <p className="mt-2 text-muted">Here’s what’s coming up for your family.</p>
          </div>
          {circles.length > 1 ? (
            <label className="grid gap-2">
              Care circle
              <select
                aria-label="Care circle"
                className={selectClass}
                value={circle.id}
                onChange={(event) => setSelectedCircle(event.target.value)}
              >
                {circles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            circle && <p className="font-semibold">{circle.name}</p>
          )}
        </div>
        {circle ? (
          <CircleDashboard key={circle.id} circle={circle} />
        ) : (
          <section className="rounded-panel border border-line bg-surface p-6">
            <h2 className="font-display text-h2 font-semibold">No care circle yet</h2>
            <p className="mt-2 text-muted">
              Your care overview will appear here once you belong to a care circle. Circle setup is not available yet.
            </p>
          </section>
        )}
        <p className="mt-8 text-muted">
          Signed in as {user.name} ({user.email}).
        </p>
        <p className="mt-6">
          <Link to="/app/appointments" className="link">
            Appointments
          </Link>
        </p>
      </main>
    </div>
  )
}
