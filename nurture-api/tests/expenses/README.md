# Isolated expense backend

Expense routes use real PostgreSQL and the existing API contract. No existing application,
authentication, or teammate-owned files were changed. The shared application does not yet
mount these routes.

## Run the tests

Prerequisites: Node.js, PostgreSQL installed with `pg_config` on PATH and the `citext`
extension available. Run as your normal user, not root.

From the repository root:

```sh
npm ci --prefix nurture-api
bash nurture-api/tests/expenses/run-local.sh
```

The runner initializes a temporary UTF-8 PostgreSQL cluster on localhost port 55439,
creates `nurture_expenses_test`, and runs the tests. It stops the server and removes
its temporary files afterward. It never uses `.env` or your normal `DATABASE_URL`.
If the port is occupied, use `EXPENSE_TEST_PORT=55440 bash nurture-api/tests/expenses/run-local.sh`.
The temporary cluster uses trust authentication on loopback only; it is for local tests,
not deployment. Do not run it on a shared or publicly accessible machine.

To use an existing dedicated local test database instead:

```sh
cd nurture-api
EXPENSE_TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/nurture_expenses_test \
  node --test tests/expenses/expenses.integration.test.cjs
```

The suite rejects remote hosts and any other database name. Each run creates a unique
schema, applies the existing schema migration's up SQL and the new expense migration's
up SQL, and inserts test users, circles, memberships, and recipients. Only that schema
is removed afterward. A failed/killed process may leave its uniquely named schema behind.
The existing initial migration's down SQL is not executed. The expense migration's own
down/up cycle is tested. These tests execute SQL directly, not the deployment migration CLI.

The test Express app supplies `req.user` through a test-only header. Membership checks,
recipient/circle isolation, validation, SQL queries, and responses are real. No test
identity mechanism is included in the production router. Authentication/JWT behavior
and full frontend integration remain separate checks once the shared server is fixed.

## Integrate later

After the shared startup/auth issues are resolved, the server owner can mount the router
in `src/app.js` after JSON parsing and before the final 404/error middleware:

```js
const authenticate = require('./middleware/authenticate');
const createExpenseRouter = require('./routes/expenses.routes');
app.use('/api/circles/:circleId/expenses', authenticate, createExpenseRouter());
```

The router defaults to the existing shared PostgreSQL pool. It expects authentication
to set `req.user.id`, and independently enforces circle membership for every request.
Any member may read/write expenses, as specified by `docs/api-contract.md`.

Apply pending migrations using the shared migration command before enabling the route.
Do not recreate the original schema or edit already-applied migrations. The new migration
adds expenses and a composite uniqueness constraint to recipients so PostgreSQL enforces
that an expense cannot point to a recipient in a different circle.

Supported routes:

- `GET /api/circles/:circleId/expenses` — date range, optional recipient/category filters
- `POST /api/circles/:circleId/expenses` — create
- `PATCH /api/circles/:circleId/expenses/:expenseId` — update supplied fields
- `DELETE /api/circles/:circleId/expenses/:expenseId` — delete

The API preserves date-only strings, exposes IDs as strings, and stores amounts as
integer cents (`BIGINT`, constrained to JavaScript's safe integer range). Lists return
all matches; totals remain a client concern. Dynamic updates only use validated,
allowlisted columns and parameterized values.
