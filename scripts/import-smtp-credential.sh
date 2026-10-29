#!/bin/sh
# Creates (or replaces) the "Server Watch SMTP" credential from the SMTP_* environment variables.
# Usage: docker compose exec n8n sh /scripts/import-smtp-credential.sh
set -eu
: "${SMTP_HOST:?SMTP_HOST is not set}"
: "${SMTP_USER:?SMTP_USER is not set}"
: "${SMTP_PASSWORD:?SMTP_PASSWORD is not set}"

file=$(mktemp)
trap 'rm -f "$file"' EXIT
node -e '
const e = process.env;
const credential = {
  id: "ServerWatchSmtp1",
  name: "Server Watch SMTP",
  type: "smtp",
  data: {
    host: e.SMTP_HOST,
    port: Number(e.SMTP_PORT || 587),
    secure: e.SMTP_SECURE === "true",
    user: e.SMTP_USER,
    password: e.SMTP_PASSWORD,
  },
};
require("fs").writeFileSync(process.argv[1], JSON.stringify([credential]));
' "$file"
n8n import:credentials --input="$file"
