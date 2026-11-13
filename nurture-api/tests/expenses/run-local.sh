#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Prerequisites: PostgreSQL binaries (including citext), Node, and npm ci.
pg_bin="$(pg_config --bindir)"
expense_port="${EXPENSE_TEST_PORT:-55439}"
expense_tmp="$(mktemp -d "/tmp/nurture-expenses-pg.XXXXXX")"
expense_started=false
cleanup() {
  if [ "$expense_started" = true ]; then
    if ! "$pg_bin/pg_ctl" -D "$expense_tmp/data" -m fast -w stop >/dev/null; then
      echo "Could not stop test PostgreSQL; files retained at $expense_tmp" >&2
      return
    fi
  fi
  rm -rf "$expense_tmp"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"$pg_bin/initdb" -D "$expense_tmp/data" -U nurture_expenses_test --auth=trust --no-locale --encoding=UTF8 >"$expense_tmp/init.log" 2>&1 || { cat "$expense_tmp/init.log"; exit 1; }
# Short socket path avoids macOS Unix-domain socket path limits.
mkdir "$expense_tmp/socket"
"$pg_bin/pg_ctl" -D "$expense_tmp/data" -l "$expense_tmp/postgres.log" -o "-h 127.0.0.1 -p $expense_port -k $expense_tmp/socket" -w start || { cat "$expense_tmp/postgres.log"; exit 1; }
expense_started=true
"$pg_bin/createdb" -h 127.0.0.1 -p "$expense_port" -U nurture_expenses_test nurture_expenses_test
EXPENSE_TEST_DATABASE_URL="postgresql://nurture_expenses_test@127.0.0.1:$expense_port/nurture_expenses_test" \
  node --test tests/expenses/expenses.integration.test.cjs
