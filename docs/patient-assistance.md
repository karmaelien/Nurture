# Patient Assistance

Implements UC9 and UC33–36: report medication cost increases or missing insurance
coverage, save the circumstances, and find external financial-assistance resources.

## Entry Points

- **Patient Assistance** on a medication in Home or Medications opens the same report
  form. Medication calendar details offer the same action.
- **Patient Assistance** in the Medications toolbar opens `/app/medications/assistance`.
  The Medications navigation tab remains active.
- Home and Medications include an assistance-notification count in their shared
  Attention Needed component. Both open the same report list and actions.

All views use the selected family and shared care-profile filter. Switching families
closes the form. Clear filters restores Everyone and Active notifications. Saving
preserves filters. Lists have bounded scrolling and load additional reports in pages
of 50; notification counts include every matching report, not only loaded pages.

## Reporting And Resources

Select an existing medication and either report a price increase or missing coverage.
Price increases require previous/current USD costs for the same quantity or refill;
the new amount must be greater. Values are stored as integer cents. Notes are optional
and limited to 500 characters. Cancel, Escape, and clicking outside close an idle
form without saving. Saving blocks duplicate submissions and dismissal until finished;
failed requests preserve the draft for retry.

Costs are **user-reported**, not verified pharmacy prices. Missing coverage is
**user-reported**, not an insurer's formal determination. Neither report modifies a
medication schedule or creates an expense.

After saving, the dialog shows the report and U.S. assistance directories. The shared
catalog is `nurture-api/src/data/assistance-resources.json`, used by both API modes:

- [NeedyMeds](https://www.needymeds.org/) — assistance and savings resources.
- [RxAssist](https://www.rxassist.org/patients) — patient-assistance program search.
- [Medicare Extra Help](https://www.medicare.gov/basics/costs/help/drug-costs) —
  prescription-cost support information for people with Medicare.

Links checked November 28, 2026. These are directories to search, not a claim that a
particular medication has a matching program or that the person qualifies. External
programs determine availability/eligibility and handle applications/payments. Links
send no patient or medication data. If one site fails, other resources remain usable.
An empty catalog displays a no-resources message and retains the saved report.

## Notification State And History

New reports create active **in-app** notifications. Dismiss notification removes the
active alert but retains its medication/person snapshot, reported circumstances, costs,
notes, and reporting timestamp. Dismissed and All reports filters expose history;
Show notification restores the alert. This feature does not send background push,
email, or text messages.

Deleting or renaming a medication does not erase/rewrite its assistance history.
Deletion clears its live medication reference and retains the original name/person.
Deleting the person or family removes associated reports. Family membership is required
for all reads/writes; report context is derived from the medication on the server.
Cached results are hidden on failed access revalidation, including saved dialog details.
An access-denied dismissal also hides that report immediately; Try again rechecks
read access before restoring its details and actions.
Already-rendered information cannot be remotely erased before a client revalidates.

Mock mode persists in the existing browser database without resetting it. The shared
write lock prevents cross-tab read/modify/write losses. A stable request UUID makes
creation retry-safe; a changed payload cannot reuse it. Notification updates require
the current version, returning 409 and refreshing after competing edits. Account/family
query keys and existing focus/storage refresh keep Home and Medications synchronized.

## PostgreSQL Activation

The real API is staged, like medications/tasks. No application database or environment
is changed by this implementation. Before using real mode:

1. Configure the existing backend database/authentication/family endpoints.
2. Run `npm run migrate:up --prefix nurture-api`, including migration
   `1795910400000_patient-assistance.sql`.
3. Enable the existing medication API for real medication selection, and set
   `ENABLE_ASSISTANCE_API=true` on the backend. Restart it.
4. Use the existing `VITE_USE_MOCKS=false` client configuration and API proxy/origin.

The PostgreSQL model uses transactions, membership/medication locks during reporting,
idempotent report insertion, and a locked version check for notification changes.
List counts and records use one SQL statement snapshot, so concurrent saves or
dismissals cannot make the count and records disagree within a response.
See [API contract](api-contract.md#patient-assistance) for endpoints.

## Verification

- `npm run typecheck --prefix client`
- `npm run lint --prefix client`
- `npm test --prefix client -- src/features/assistance/assistance.test.tsx`
- `npm run build --prefix client`
- `npm run test:assistance --prefix nurture-api`

The PostgreSQL integration test requires `ASSISTANCE_TEST_DATABASE_URL` pointing to
a separate local database with `test` in its name; it refuses the application
`DATABASE_URL`, creates an isolated schema, and drops that schema afterward. Without
that variable, only the PostgreSQL integration case is skipped.
