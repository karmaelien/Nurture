exports.toMember = (m, relationships = {}) => ({
  user: { id: String(m.user_id), name: m.username, email: m.email },
  role: m.role,
  joinedAt: m.created_at,
  relationships,
});