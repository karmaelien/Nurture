// Shared request/response shapes for the auth endpoints. Keep in sync with docs/api-contract.md.

export type User = {
  id: string
  name: string
  email: string
}

/**
 * The contract's session also lists the user's care circles. Login and registration don't use them yet,
 * so they're left out here until the circle features are built.
 */
export type Session = {
  user: User
}

export type AuthResponse = Session & { token: string }

export type RegisterRequest = { name: string; email: string; password: string }
export type LoginRequest = { email: string; password: string }

export type ApiErrorBody = {
  error: { code: string; message: string }
}
