import { CircleSelection } from '../circles/CircleSelection.tsx'
import { circleLink, useCircleSelection } from '../circles/selection.ts'
import { Link, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ListChecks, Pill, UserPlus, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { circlesApi } from '../../api/circles.ts'
import type { CircleSummary, ExpenseCategory, CareTask } from '../../api/types.ts'
import { Button } from '../../components/ui/Button.tsx'
import { buttonClasses } from '../../components/ui/buttonClasses.ts'
import { useRequiredSession } from '../auth/session.ts'
import { appointmentUpcomingEnd } from '../appointments/appointment-window.ts'
import { useExpenses, useMedicationOccurrences, useTasks } from '../care/queries.ts'
import { DashboardPanel as Panel, type QueryState } from './DashboardPanel.tsx'
import { HomeAppointmentsPanel } from './HomeAppointmentsPanel.tsx'
import { TaskListItem } from '../tasks/TaskListItem.tsx'
import { TaskEditor } from '../tasks/TaskEditor.tsx'
import { TaskDeleteDialog } from '../tasks/TaskDeleteDialog.tsx'
import { compareTasks } from '../tasks/task-order.ts'
import { useHomeAppointments } from './useHomeAppointments.ts'
import { dashboardWindow, formatMoney } from './dashboard.ts'
import { CareProfileSelection } from '../care/CareProfileSelection.tsx'
import { useCareSelection } from '../care/selection.ts'
import { MedicationPanel } from '../medications/MedicationPanel.tsx'
import { useMinute } from '../profiles/time.ts'

const categoryNames: Record<ExpenseCategory, string> = {
  medication: 'Medication',
  appointment: 'Appointments',
  insurance: 'Insurance',
  utilities: 'Utilities',
  other: 'Other',
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
  const [editingTask, setEditingTask] = useState<CareTask | null>(null)
  const [deletingTask, setDeletingTask] = useState<CareTask | null>(null)
  const { recipientId, setRecipientId } = useCareSelection(circle)
  const now = useMinute()
  const windowDates = dashboardWindow(now)
  const recipient = recipientId || undefined
  const medications = useMedicationOccurrences(circle.id, {
    from: windowDates.todayStart,
    to: windowDates.tomorrowStart,
    recipientId: recipient,
  })
  const tasks = useTasks(circle.id, { dueBefore: windowDates.to, recipientId: recipient })
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
  const appointments = useHomeAppointments(
    circle,
    {
      from: windowDates.from,
      to: new Date(appointmentUpcomingEnd(now.getTime())).toISOString(),
      recipientId: recipient,
    },
    assigned,
  )
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
  const count = (query: QueryState & { data?: CareTask[] }) =>
    query.isError
      ? 'Unavailable'
      : query.isPending
        ? '…'
        : String(query.data?.filter((task) => task.status === 'pending').length ?? 0)

  // Home retains today's completions for undo; its outstanding count includes only pending tasks.
  const taskEntries = (tasks.data ?? [])
    .filter(
      (task) =>
        task.status === 'pending' ||
        (task.completedAt && Date.parse(task.completedAt) >= Date.parse(windowDates.todayStart)),
    )
    .sort(compareTasks)
  return (
    <>
      {deletingTask && (
        <TaskDeleteDialog task={deletingTask} circleId={circle.id} onClose={() => setDeletingTask(null)} />
      )}
      {editingTask && details.data && !details.isError && (
        <TaskEditor
          circle={details.data.circle}
          recipientId={recipientId}
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <p className="text-muted">
          {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <CareProfileSelection circle={circle} value={recipientId} onChange={setRecipientId} />
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
        <Stat label="Upcoming appointments · next 7 days" value={appointments.upcomingCountLabel} />
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
        <div className="grid content-start gap-5">
          <Panel id="tasks" title="Tasks" icon={<ListChecks />} query={tasks} empty={!taskEntries.length}>
            <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto pr-2">
              {taskEntries.map((task) => (
                <TaskListItem
                  key={task.id}
                  task={task}
                  circleId={circle.id}
                  person={name(task.recipientId)}
                  caregiver={assigned(task.assignedCaregiverId)}
                  now={now.getTime()}
                  compact
                  onEdit={details.data && !details.isError ? () => setEditingTask(task) : undefined}
                  onDelete={() => setDeletingTask(task)}
                />
              ))}
            </ul>
          </Panel>
          <HomeAppointmentsPanel
            appointments={appointments}
            circle={circle}
            recipientId={recipient}
            now={now.getTime()}
            caregivers={details.data?.circle.members.map((member) => member.user) ?? []}
          />
        </div>
        <div className="grid content-start gap-5">
          <Panel
            id="expenses"
            title="Care spending"
            icon={<Wallet />}
            query={expenses}
            empty={!expenses.data?.length}
            action={
              <Link to={circleLink('/app/expenses', circle.id)} className={buttonClasses({ variant: 'secondary' })}>
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
      </div>
      <div className="mt-5">
        <MedicationPanel
          id="medications"
          circle={circle}
          showCaregiverError={false}
          showProfileFilter={false}
          heading={
            <Link
              to={circleLink('/app/medications', circle.id)}
              aria-label="View medications"
              className="flex items-center gap-2 rounded-control hover:text-primary"
            >
              <h2 className="font-display text-h3 font-semibold">Medications</h2>
              <Pill className="size-5 text-primary" aria-hidden />
            </Link>
          }
        />
      </div>
    </>
  )
}

export function HomePage() {
  const { user, circles } = useRequiredSession()
  const { circle, selectCircle } = useCircleSelection(circles)
  const { hash, key: locationKey } = useLocation()
  useEffect(() => {
    if (hash === '#tasks') document.getElementById('tasks')?.scrollIntoView({ block: 'start' })
  }, [hash, locationKey, circle?.id])
  return (
    <div className="min-h-dvh">
      <main id="overview" className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-5">
          <div>
            <h1 className="font-display text-h1 font-bold">A little clarity for your day.</h1>
            <p className="mt-2 text-muted">Here’s what’s coming up for your family.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <CircleSelection circles={circles} circle={circle} onChange={selectCircle} />
            {circle && (
              <Link
                to={`/app/circles/${encodeURIComponent(circle.id)}/people/new`}
                className={buttonClasses({ variant: 'secondary', size: 'sm' })}
              >
                <UserPlus className="size-4" aria-hidden />
                Add a person
              </Link>
            )}
          </div>
        </div>
        {/* RequireCircle guarantees a circle, so only an unknown ?circleId lands here. */}
        {circle ? (
          <CircleDashboard key={circle.id} circle={circle} />
        ) : (
          <section className="rounded-panel border border-line bg-surface p-6">
            <h2 className="font-display text-h2 font-semibold">Select a care circle</h2>
            <p className="mt-2 text-muted">Choose an available circle above to view its dashboard.</p>
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
