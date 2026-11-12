exports.toMember = (m, relationships = {}) => ({
  user: { id: String(m.user_id), name: m.username, email: m.email, phone: m.phone ?? null, timeZone: m.timezone ?? null },
  role: m.role,
  joinedAt: m.created_at,
  relationships,
});
exports.toRecipient = (r, relationship = r.relationship ?? null) => ({
  id: String(r.id),
  name: r.name,
  preferredName: r.preferred_name ?? null,
  dateOfBirth: r.date_of_birth ?? null,
  notes: r.notes ?? null,
  relationship,
});