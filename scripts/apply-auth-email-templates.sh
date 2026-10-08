#!/usr/bin/env bash
# Apply the auth email templates in supabase/config.toml ([auth.email.template.*]) to the hosted
# project through the Management API. Only the subject and body of those templates change;
# `supabase config push` would also push this repo's local-only auth settings (site_url).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      cat <<'USAGE'
Usage: SUPABASE_ACCESS_TOKEN=... scripts/apply-auth-email-templates.sh [--dry-run]

Reads each [auth.email.template.<name>] (subject + content_path) from supabase/config.toml and
PATCHes mailer_subjects_<name> / mailer_templates_<name>_content on the linked project
(supabase/.temp/project-ref, or PROJECT_REF). --dry-run prints the payload keys only.
Token: https://supabase.com/dashboard/account/tokens
USAGE
      exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

PROJECT_REF="${PROJECT_REF:-$(cat supabase/.temp/project-ref 2>/dev/null || true)}"
[[ -n "$PROJECT_REF" ]] || { echo "Set PROJECT_REF or run 'supabase link' first." >&2; exit 1; }

PAYLOAD="$(python3 - <<'PY'
import json, pathlib, tomllib
config = tomllib.loads(pathlib.Path("supabase/config.toml").read_text())
templates = config.get("auth", {}).get("email", {}).get("template", {})
payload = {}
for name, t in templates.items():
    payload[f"mailer_subjects_{name}"] = t["subject"]
    # content_path is relative to the repo root, as the Supabase CLI resolves it.
    payload[f"mailer_templates_{name}_content"] = pathlib.Path(t["content_path"]).read_text()
print(json.dumps(payload))
PY
)"

if $DRY_RUN; then
  echo "Would update $PROJECT_REF:"
  python3 -c 'import json,sys; [print("  " + k) for k in json.loads(sys.argv[1])]' "$PAYLOAD"
  exit 0
fi

[[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]] || { echo "Set SUPABASE_ACCESS_TOKEN (see --help)." >&2; exit 1; }
curl -fsS -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD" > /dev/null
echo "Updated auth email templates on $PROJECT_REF."
