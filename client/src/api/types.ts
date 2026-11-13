// Shared request/response shapes for the API endpoints. Keep in sync with docs/api-contract.md.

export type User = {
  id: string
  name: string
  email: string
  phone: string | null // as entered, so the family can reach them
  timeZone: string | null // IANA name, such as "America/New_York"; null until the user sets it
}

export type Role = 'owner' | 'member'

// How the signed-in user relates to a recipient ("Rose is my grandparent").
export type Relationship = 'parent' | 'grandparent' | 'spouse' | 'sibling' | 'child' | 'friend' | 'other'

export type Recipient = {
  id: string
  name: string
  preferredName: string | null // what the family calls them, such as "Grandma Rose"
  dateOfBirth: string | null // YYYY-MM-DD calendar date
  notes: string | null // short free text for the family, not a medical record
  // The signed-in user's own label for this recipient, if they set one.
  relationship: Relationship | null
}

// What the signed-in user sees for each of their circles.
export type CircleSummary = {
  id: string
  name: string
  role: Role // the signed-in user's role in this circle
  recipients: Recipient[]
}

export type Member = {
  user: User
  role: Role
  joinedAt: string
  // This member's labels for the circle's recipients, keyed by recipient id. Missing means no label.
  relationships: Record<string, Relationship>
}

export type CircleDetail = CircleSummary & { members: Member[] }

export type Session = { user: User; circles: CircleSummary[] }

export type Appointment = {
  id: string
  recipientId: string
  title: string
  startsAt: string // UTC timestamp
  location: string | null
  assignedCaregiverId: string | null // null means unassigned
}

export type MedicationOccurrence = {
  id: string // unique to this occurrence
  medicationId: string
  recipientId: string
  name: string
  dosage: string // display text supplied by the care-management feature
  scheduledAt: string // UTC timestamp
  status: 'pending' | 'completed'
}

export type CareTask = {
  id: string
  recipientId: string
  title: string
  dueAt: string | null // UTC timestamp, or no due date
  assignedCaregiverId: string | null
  status: 'pending' | 'completed'
  completedAt: string | null // non-null exactly when status is completed
}

export type ExpenseCategory = 'medication' | 'appointment' | 'insurance' | 'utilities' | 'other'

export type Expense = {
  id: string
  recipientId: string
  description: string
  category: ExpenseCategory
  amountCents: number // positive integer; sum integer cents, not floating-point dollars
  currency: 'USD' // initial mock supports USD only
  incurredOn: string // YYYY-MM-DD calendar date, not a UTC timestamp
}

export type AuthResponse = Session & { token: string }

export type RegisterRequest = { name: string; email: string; password: string }
export type LoginRequest = { email: string; password: string }

export type UpdateProfileRequest = { name?: string; phone?: string | null; timeZone?: string | null }

export type RecipientInput = {
  name: string
  preferredName: string | null
  dateOfBirth: string | null
  notes: string | null
  relationship: Relationship | null
}

export type CreateCircleRequest = { name: string; recipient: RecipientInput }

export type ApiErrorBody = {
  error: { code: string; message: string }
}

export type AppointmentFilters = { from: string; to: string; recipientId?: string }
export type MedicationOccurrenceFilters = AppointmentFilters & { status?: MedicationOccurrence['status'] }
export type TaskFilters = {
  dueFrom?: string
  dueBefore?: string
  completedFrom?: string
  completedBefore?: string
  status?: CareTask['status']
  recipientId?: string
}
export type ExpenseFilters = { fromDate: string; toDate: string; recipientId?: string; category?: ExpenseCategory }

export type CreateExpenseRequest = Omit<Expense, 'id'>
export type UpdateExpenseRequest = Partial<CreateExpenseRequest>
