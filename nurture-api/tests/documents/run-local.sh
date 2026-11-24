#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Prerequisites: PostgreSQL binaries (including citext), Node, and npm ci.
pg_bin="$(pg_config --bindir)"
document_port="${DOCUMENT_TEST_PORT:-55440}"
document_tmp="$(mktemp -d "/tmp/nurture-documents-pg.XXXXXX")"
document_started=false
cleanup() {
  if [ "$document_started" = true ]; then
    if ! "$pg_bin/pg_ctl" -D "$document_tmp/data" -m fast -w stop >/dev/null; then
      echo "Could not stop test PostgreSQL; files retained at $document_tmp" >&2
      return
    fi
  fi
  rm -rf "$document_tmp"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"$pg_bin/initdb" -D "$document_tmp/data" -U nurture_documents_test --auth=trust --no-locale --encoding=UTF8 >"$document_tmp/init.log" 2>&1 || { cat "$document_tmp/init.log"; exit 1; }
# Short socket path avoids macOS Unix-domain socket path limits.
mkdir "$document_tmp/socket"
"$pg_bin/pg_ctl" -D "$document_tmp/data" -l "$document_tmp/postgres.log" -o "-h 127.0.0.1 -p $document_port -k $document_tmp/socket" -w start || { cat "$document_tmp/postgres.log"; exit 1; }
document_started=true
"$pg_bin/createdb" -h 127.0.0.1 -p "$document_port" -U nurture_documents_test nurture_documents_test
DOCUMENT_TEST_DATABASE_URL="postgresql://nurture_documents_test@127.0.0.1:$document_port/nurture_documents_test" \
  node --test tests/documents/documents.integration.test.cjs
