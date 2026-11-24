const circle = (circleId: string) => `/app/circles/${encodeURIComponent(circleId)}`

/** Where each profile page lives. */
export const profilePaths = {
  family: (circleId: string) => `${circle(circleId)}/family`,
  addPerson: (circleId: string) => `${circle(circleId)}/people/new`,
  person: (circleId: string, recipientId: string) => `${circle(circleId)}/people/${encodeURIComponent(recipientId)}`,
  editPerson: (circleId: string, recipientId: string) =>
    `${circle(circleId)}/people/${encodeURIComponent(recipientId)}/edit`,
  caregiver: (circleId: string, userId: string) => `${circle(circleId)}/caregivers/${encodeURIComponent(userId)}`,
  me: '/app/profile',
}
