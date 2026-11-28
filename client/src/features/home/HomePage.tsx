import { QueryFeedback } from '../../components/ui/QueryFeedback.tsx'
import { Alert } from '../../components/ui/Alert.tsx'
import { CircleSelection } from '../circles/CircleSelection.tsx'
import { circleLink, useCircleSelection } from '../circles/selection.ts'
import { useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ListChecks, Pill, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { circlesApi } from '../../api/circles.ts'
import type { CircleSummary, ExpenseCategory, CareTask } from '../../api/types.ts'
import { Button } from '../../components/ui/Button.tsx'
import { ExpenseForm } from '../expenses/ExpensesPage.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { appointmentUpcomingEnd } from '../appointments/appointment-window.ts'
import { useExpenses, useTasks } from '../care/queries.ts'
import { DashboardPanel as Panel } from './DashboardPanel.tsx'
import { HomeAppointmentsPanel } from './HomeAppointmentsPanel.tsx'
import { TaskListItem } from '../tasks/TaskListItem.tsx'
import { TaskEditor } from '../tasks/TaskEditor.tsx'
import { TaskDeleteDialog } from '../tasks/TaskDeleteDialog.tsx'
import { HomeAttention } from './HomeAttention.tsx'
import { compareTasks } from '../tasks/task-order.ts'
import { useHomeAppointments } from './useHomeAppointments.ts'
import { dashboardWindow, formatMoney } from './dashboard.ts'
import { CareProfileSelection } from '../care/CareProfileSelection.tsx'
import { useCareSelection } from '../care/selection.ts'
import { MedicationPanel } from '../medications/MedicationPanel.tsx'
import { useMinute } from '../profiles/time.ts'

import { PageHeader } from '../../components/ui/PageHeader.tsx'
import { FeatureToolbar } from '../../components/ui/FeatureToolbar.tsx'

const categoryNames: Record<ExpenseCategory, string> = {
  medication: 'Medication',
  appointment: 'Appointments',
  insurance: 'Insurance',
  utilities: 'Utilities',
  other: 'Other',
}

function CircleDashboard({ circle }: { circle: CircleSummary }) {
  const { user } = useRequiredSession()
  const [editingTask, setEditingTask] = useState<CareTask | null>(null)
  const [addingTask, setAddingTask] = useState(false)
  const [addingExpense, setAddingExpense] = useState(false)
  const [notice, setNotice] = useState('')
  const [deletingTask, setDeletingTask] = useState<CareTask | null>(null)
  const { recipientId, setRecipientId, resetFilters } = useCareSelection(circle)
  const now = useMinute()
  const windowDates = dashboardWindow(now)
  const recipient = recipientId || undefined
  const tasks = useTasks(circle.id, { dueBefore: windowDates.to, includeUndated: true, recipientId: recipient })
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
  // Home retains today's completions for undo alongside the pending tasks.
  const taskEntries = (tasks.data ?? [])
    .filter(
      (task) =>
        task.status === 'pending' ||
        (task.completedAt && Date.parse(task.completedAt) >= Date.parse(windowDates.todayStart)),
    )
    .sort(compareTasks)
  return (
    <>
      {addingExpense && (
        <ExpenseForm
          circle={circle}
          expense={null}
          initialRecipientId={recipientId || undefined}
          onClose={(saved) => {
            setAddingExpense(false)
            if (saved) setNotice('Expense saved. Clear filters if it is not shown.')
          }}
        />
      )}
      {deletingTask && (
        <TaskDeleteDialog task={deletingTask} circleId={circle.id} onClose={() => setDeletingTask(null)} />
      )}
      {(addingTask || editingTask) && details.data && !details.isError && (
        <TaskEditor
          circle={details.data.circle}
          recipientId={recipientId}
          task={editingTask ?? undefined}
          onClose={() => {
            setEditingTask(null)
            setAddingTask(false)
          }}
          onSaved={() => setNotice('Task saved. Clear filters if it is not shown.')}
        />
      )}
      <FeatureToolbar onClear={resetFilters}>
        <CareProfileSelection circle={circle} value={recipientId} onChange={setRecipientId} />
      </FeatureToolbar>
      {notice && <Alert tone="success">{notice}</Alert>}
      {details.isError && (
        <div className="mb-6">
          <QueryFeedback query={details} message="Caregiver names could not load." />
        </div>
      )}
      <HomeAttention
        circle={circle}
        recipientId={recipientId}
        now={now.getTime()}
        tasks={tasks}
        caregiverName={assigned}
        caregivers={details.data?.circle.members.map((member) => member.user) ?? []}
        onTaskEdit={details.data && !details.isError ? setEditingTask : undefined}
        onTaskDelete={setDeletingTask}
        onAppointmentSaved={(action) =>
          setNotice(
            action === 'deleted' ? 'Appointment deleted.' : 'Appointment saved. Clear filters if it is not shown.',
          )
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-5">
          <Panel
            id="tasks"
            title="Tasks"
            to={circleLink('/app/tasks', circle.id)}
            icon={<ListChecks />}
            query={tasks}
            empty={!taskEntries.length && !tasks.historyPending}
            action={
              <Button
                disabled={!details.data || details.isError || !circle.recipients.length}
                onClick={() => setAddingTask(true)}
              >
                Add task
              </Button>
            }
          >
            {tasks.historyPending && (
              <p role="status" className="mb-3 text-muted">
                Loading older repeating tasks…
              </p>
            )}
            <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto pr-2">
              {taskEntries.map((task) => (
                <TaskListItem
                  key={task.id}
                  task={task}
                  circleId={circle.id}
                  person={name(task.recipientId)}
                  caregiver={assigned(task.assignedCaregiverId)}
                  now={now.getTime()}
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
            canAdd={!!details.data && !details.isError}
            onSaved={(action) =>
              setNotice(
                action === 'deleted' ? 'Appointment deleted.' : 'Appointment saved. Clear filters if it is not shown.',
              )
            }
          />
        </div>
        <div className="grid content-start gap-5">
          <Panel
            id="expenses"
            title="Expenses"
            to={circleLink('/app/expenses', circle.id)}
            icon={<Wallet />}
            query={expenses}
            empty={!expenses.data?.length}
            action={
              <Button disabled={!circle.recipients.length} onClick={() => setAddingExpense(true)}>
                Add expense
              </Button>
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
          <MedicationPanel
            id="medications"
            circle={circle}
            showCaregiverError={false}
            showProfileFilter={false}
            showAttention={false}
            heading={{ title: 'Medications', icon: <Pill />, to: circleLink('/app/medications', circle.id) }}
          />
        </div>
      </div>
    </>
  )
}

export function HomePage() {
  const { user, circles } = useRequiredSession()
  const today = useMinute()
  const { circle, selectCircle } = useCircleSelection(circles)
  const { hash, key: locationKey } = useLocation()
  useEffect(() => {
    if (hash === '#tasks') document.getElementById('tasks')?.scrollIntoView({ block: 'start' })
  }, [hash, locationKey, circle?.id])
  return (
    <div className="min-h-dvh">
      <main id="overview" className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
        <PageHeader
          title="Overview"
          description={today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          aside={<CircleSelection circles={circles} circle={circle} onChange={selectCircle} />}
        />
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
      </main>
    </div>
  )
}
