# nurture-api

The Nurture backend: an Express 5 + PostgreSQL API that handles accounts, sessions, care circles, and circle-level permissions. The client builds against [`docs/api-contract.md`](../docs/api-contract.md); this API implements the auth, circle, member, and recipient parts of it.

## Requirements

- Node.js 24 LTS and npm
- PostgreSQL 14 or later, with permission to create the `citext` extension

## Getting started

From this folder:

```bash
npm install
```

Create `.env`:

```bash
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/nurture
PORT=3000
```

Create the tables, then start the server with auto-reload:

```bash
npm run migrate:up
npm run dev
```

Check that the API can reach the database:

```bash
curl http://localhost:3000/health
```

The client's Vite dev server proxies `/api` to port 3000. To use this API instead of the client's in-browser mock, set `VITE_USE_MOCKS=false` in `client/.env.local`.

Never commit `.env`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the server with nodemon |
| `npm run migrate:up` | Applies pending migrations |
| `npm run migrate:down` | Rolls back the latest migration |
| `npm test` | Runs the Vitest suite |

The schema is still a single migration (`src/db/migrations/…_init-schema.sql`). While it's changing, reset with `npm run migrate:down && npm run migrate:up`. This deletes all data.

## Project structure

```text
src/
  server.js          Starts the HTTP server and closes the database pool on shutdown
  app.js             Middleware, routers, 404 handler, error handler
  config/            Environment variables and the pg connection pool
  routes/            URL → middleware → controller
  middleware/        authenticate, requirePermission, requireAdmin, errorHandler
  controllers/       Validate input, call models, shape responses
  models/            Parameterized SQL queries; return database rows
  validators/        zod schemas for request bodies
  utils/             Tokens, permissions, response serializers, httpError
  db/migrations/     SQL migrations (node-pg-migrate)
```

Requests flow route → middleware → controller → model → Postgres. Errors passed to `next(err)` end up in `errorHandler`.

## Data model

| Table | Purpose |
| --- | --- |
| `users` | Accounts. `email` is unique and case-insensitive. Passwords are argon2 hashes. `is_admin` marks platform staff |
| `circles` | A group that shares care, such as "Alvarez family". Optional `budget` in whole cents |
| `circle_members` | Joins users to circles with a role: `owner` or `member` |
| `recipients` | People being cared for. Each belongs to exactly one circle |
| `care_relationships` | Optional per-user label for a recipient ("my grandparent"). Display only; never grants access |
| `refresh_tokens` | Login sessions: one row per device, storing only a SHA-256 hash of the token |
| `audit_log` | Reserved for access and change records; not written to yet |
| `documents`, `tasks` | Placeholders for the care and document features; not used by this API yet |

## Authentication

- **Register or log in** to receive a token, then send it on every request as `Authorization: Bearer <token>`.
- **Tokens** are 256 random bits. The database stores only their SHA-256 hash, so a database leak exposes no usable tokens.
- **Sessions** last 4 hours. Each login is a separate session, so one person can be logged in on several devices.
- **Logout** revokes only the current session and always returns 204, even for an already-invalid token.
- **`authenticate`** hashes the token, loads the user from an active session, and sets `req.user`. Missing, expired, or revoked tokens get `401 unauthorized`.
- **Rate limiting:** register and login allow 10 requests per minute per IP.

## Access control

### Circle roles

Access to a circle comes only from membership. The user who creates a circle is its owner.

| Permission | owner | member |
| --- | :---: | :---: |
| `circle:view` | ✓ | ✓ |
| `circle:edit` (rename, budget) | ✓ | |
| `circle:delete` | ✓ | |
| `members:view` | ✓ | ✓ |
| `members:manage` (add, remove) | ✓ | |
| `content:edit` (recipients and care data) | ✓ | ✓ |

The table lives in `src/utils/permissions.js`. `requirePermission(permission)` runs on every route with a `:circleId`:

1. Loads the caller's membership in that circle.
2. Not a member, or no such circle: **404 `not_found`**, so non-members can't tell the circle exists.
3. Role lacks the permission: **403 `forbidden`**.
4. Otherwise it sets `req.circleId` and `req.membership` and continues.

The owner can't be removed. Removing a member also deletes their relationship labels in that circle.

### Staff admins

`users.is_admin` marks Nurture staff. It's granted only directly in the database and is never returned by the API:

```sql
UPDATE users SET is_admin = true WHERE email = 'staff@example.com';
```

Admins can use `/api/admin/...` to manage accounts. **They have no access inside circles** unless they're ordinary members, and admin routes never return circle or care data. `requireAdmin` returns 404 to everyone else, so the admin routes look like they don't exist.

## Endpoints

All paths start with `/api`. Request and response bodies are JSON. Full request and response shapes are in the [API contract](../docs/api-contract.md).

| Method and path | Access | Purpose |
| --- | --- | --- |
| `POST /auth/register` | Public, rate limited | Create an account; returns `{ token, user, circles }` |
| `POST /auth/login` | Public, rate limited | Start a session; returns `{ token, user, circles }` |
| `GET /auth/me` | Signed in | Current user and their circles |
| `POST /auth/logout` | Anyone | End the current session |
| `POST /circles` | Signed in | Create a circle with its first recipient; caller becomes owner |
| `GET /circles/:circleId` | `circle:view` | Circle with recipients and members |
| `PATCH /circles/:circleId` | `circle:edit` | Rename, or set the budget |
| `GET /circles/:circleId/members` | `members:view` | List members |
| `POST /circles/:circleId/members` | `members:manage` | Add an existing user by email |
| `DELETE /circles/:circleId/members/:userId` | `members:manage` | Remove a member |
| `POST /circles/:circleId/recipients` | `content:edit` | Add a recipient |
| `PUT /circles/:circleId/recipients/:recipientId/relationship` | `circle:view` | Set or clear your own label for a recipient |
| `GET /admin/users` | Staff admin | List accounts (no circle data) |
| `POST /admin/users/:userId/sessions/revoke` | Staff admin | End all of a user's sessions |
| `GET /health` | Public | Database connectivity check |

The member endpoints and `budget` aren't in the API contract yet.

### Errors

Every error uses the contract's shape, and the client shows `message` to the user directly:

```json
{ "error": { "code": "not_found", "message": "Circle not found." } }
```

Codes are lowercase: `validation_error`, `unauthorized`, `forbidden`, `not_found`, `invalid_credentials`, `email_taken`, `already_member`, `user_not_found`, `internal_error`. Responses for unexpected errors (500) never include internal details.

## Adding routes for care data

Appointments, medications, tasks, expenses, and documents belong to a circle or a recipient. To keep them private:

1. **Mount under the circle router** so `authenticate` and `requirePermission` apply:
   ```js
   router.get('/:circleId/recipients/:recipientId/appointments',
     requirePermission('circle:view'), appointments.list);
   ```
   Use `circle:view` for reads and `content:edit` for writes. Add a new permission to `permissions.js` if a role needs to be excluded.
2. **Scope every query to the checked circle.** Take IDs only from `req.circleId` and route parameters, never from the request body. Check that a `:recipientId` belongs to the circle with `Recipient.findInCircle(req.circleId, recipientId)` and return 404 if it doesn't.
3. **Never send raw rows.** Build responses from an allowlist of fields (see `src/utils/serializers.js`). This keeps columns like `is_admin`, `password_hash`, and internal IDs out of responses, including columns added later.
4. **Validate every body with zod** in `src/validators/`, and return `400 validation_error` with a message the user can act on.
5. **Use `$1`-style parameters** for every value in SQL. Never build SQL from request input.
6. **Don't log personal data** such as names, dates of birth, notes, or file contents.
7. **Wrap multi-step writes in a transaction** so a failure can't leave half-saved data.

## Security practices

- Passwords are hashed with argon2. Session tokens are stored only as SHA-256 hashes.
- `helmet` sets security headers on every response.
- All SQL uses parameterized queries.
- Non-members get 404, not 403, for anything inside a circle.
- Staff admins can't read circle data.
- Unexpected errors return a generic message; details go only to server logs.

These are designed with HIPAA's Security Rule safeguards in mind. Nurture hasn't been assessed for HIPAA compliance.

## Known gaps

- `audit_log` exists but nothing writes to it yet.
- Creating a circle runs several inserts without a transaction.
- An unknown email at login responds faster than a wrong password, which reveals which emails have accounts.
- No idle timeout or per-account login lockout.
- Production needs HTTPS, a database connection over TLS, a CORS policy, `trust proxy`, and a restricted database role for the app.
