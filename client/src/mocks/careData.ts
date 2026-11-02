import type { Appointment, CareTask, Expense, MedicationOccurrence } from '../api/types.ts'

// Created once with the mock database. Calendar arithmetic uses the browser's local time zone.
export function seedCareData(now = new Date()) {
  const at = (days: number, hour: number) => {
    const date = new Date(now)
    date.setDate(date.getDate() + days)
    date.setHours(hour, 0, 0, 0)
    return date.toISOString()
  }
  const incurredOn = (daysAgo: number) => {
    const date = new Date(now)
    date.setDate(Math.max(1, date.getDate() - daysAgo))
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  const appointments: Appointment[] = [
    {
      id: 'a_checkup',
      recipientId: 'r_rose',
      title: 'Annual checkup',
      startsAt: at(1, 10),
      location: 'Family clinic',
      assignedCaregiverId: 'u_demo',
    },
    {
      id: 'a_therapy',
      recipientId: 'r_frank',
      title: 'Physical therapy',
      startsAt: at(2, 14),
      location: 'Community care center',
      assignedCaregiverId: 'u_daniel',
    },
    {
      id: 'a_followup',
      recipientId: 'r_rose',
      title: 'Follow-up appointment',
      startsAt: at(5, 11),
      location: null,
      assignedCaregiverId: null,
    },
  ]
  const medicationOccurrences: MedicationOccurrence[] = [
    {
      id: 'dose_morning',
      medicationId: 'med_rose',
      recipientId: 'r_rose',
      name: 'Sample medication A',
      dosage: '1 tablet',
      scheduledAt: at(0, 8),
      status: 'completed',
    },
    {
      id: 'dose_noon',
      medicationId: 'med_frank',
      recipientId: 'r_frank',
      name: 'Sample medication B',
      dosage: '1 tablet',
      scheduledAt: at(0, 12),
      status: 'pending',
    },
    {
      id: 'dose_evening',
      medicationId: 'med_rose',
      recipientId: 'r_rose',
      name: 'Sample medication A',
      dosage: '1 tablet',
      scheduledAt: at(0, 20),
      status: 'pending',
    },
  ]
  const tasks: CareTask[] = [
    {
      id: 't_overdue',
      recipientId: 'r_rose',
      title: 'Pick up prescription',
      dueAt: at(-1, 16),
      assignedCaregiverId: 'u_demo',
      status: 'pending',
      completedAt: null,
    },
    {
      id: 't_today',
      recipientId: 'r_frank',
      title: 'Grocery delivery',
      dueAt: at(0, 17),
      assignedCaregiverId: 'u_daniel',
      status: 'pending',
      completedAt: null,
    },
    {
      id: 't_upcoming',
      recipientId: 'r_rose',
      title: 'Arrange transport',
      dueAt: at(2, 9),
      assignedCaregiverId: null,
      status: 'pending',
      completedAt: null,
    },
    {
      id: 't_completed',
      recipientId: 'r_frank',
      title: 'Morning check-in',
      dueAt: at(0, 8),
      assignedCaregiverId: 'u_demo',
      status: 'completed',
      completedAt: at(0, 8),
    },
  ]
  const expenses: Expense[] = [
    {
      id: 'e_pharmacy',
      recipientId: 'r_rose',
      description: 'Pharmacy pickup',
      category: 'medication',
      amountCents: 2450,
      currency: 'USD',
      incurredOn: incurredOn(0),
    },
    {
      id: 'e_clinic',
      recipientId: 'r_frank',
      description: 'Clinic copay',
      category: 'appointment',
      amountCents: 3500,
      currency: 'USD',
      incurredOn: incurredOn(1),
    },
    {
      id: 'e_insurance',
      recipientId: 'r_rose',
      description: 'Insurance premium',
      category: 'insurance',
      amountCents: 12500,
      currency: 'USD',
      incurredOn: incurredOn(2),
    },
    {
      id: 'e_utilities',
      recipientId: 'r_frank',
      description: 'Electricity bill',
      category: 'utilities',
      amountCents: 6800,
      currency: 'USD',
      incurredOn: incurredOn(3),
    },
    {
      id: 'e_transport',
      recipientId: 'r_rose',
      description: 'Appointment transport',
      category: 'other',
      amountCents: 1800,
      currency: 'USD',
      incurredOn: incurredOn(4),
    },
  ]
  return { appointments, medicationOccurrences, tasks, expenses }
}
