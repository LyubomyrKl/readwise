#!/usr/bin/env bash
# Says what is wired and what is missing for a tool on both sides.  Usage: check_tool.sh <tool-id>
# Exit 1 when something is missing; the lines say what and where it belongs.
set -u

ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
id=${1:?usage: check_tool.sh <tool-id>}
if ! [[ $id =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "check_tool: the id must be lowercase letters, digits and hyphens" >&2
  exit 2
fi

fail=0
ok()   { printf '  ok    %s\n' "$1"; }
miss() { printf '  MISS  %s\n' "$1"; fail=1; }
check_file() { if [ -e "$ROOT/$1" ]; then ok "$1"; else miss "$1: $2"; fi; }
check_text() { if grep -qF -- "$1" "$ROOT/$2" 2>/dev/null; then ok "$2 has $1"; else miss "$2 lacks $1: $3"; fi; }

echo "API (apps/api)"
check_file "apps/api/src/tools/$id" "the tool's directory"
if ls "$ROOT/apps/api/src/tools/$id"/*.module.ts >/dev/null 2>&1; then
  ok "a NestJS module in src/tools/$id"
else
  miss "src/tools/$id/<name>.module.ts: the tool's NestJS module"
fi
check_text "@tools/$id/" "apps/api/src/tool-registry.ts" "import the module and add it to TOOL_MODULES"
check_file "apps/api/prisma/schema/$id.prisma" "the tool's schema file (skip if the tool has no tables)"
check_text "^@tools/(?!$id(/|\$))" "apps/api/eslint.config.mjs" "a boundary block so the tool cannot import other tools"

echo "Web (apps/web)"
for f in manifest.ts routes.ts api.ts queries.ts; do
  check_file "apps/web/src/tools/$id/$f" "see references/templates.md"
done
check_text "@tools/$id/manifest" "apps/web/src/platform/shell/registry.ts" "import the manifest and add it to ALL_TOOLS"
check_file "apps/web/app/(shell)/apps/$id/page.tsx" "route file re-exporting the home page"
check_text "^@tools/(?!$id(/|\$))" "apps/web/eslint.config.mjs" "a boundary block so the tool cannot import other tools"
if grep -q "settings:" "$ROOT/apps/web/src/tools/$id/manifest.ts" 2>/dev/null; then
  check_file "apps/web/app/(shell)/settings/$id/page.tsx" "the manifest declares a settings section"
fi

schema="$ROOT/apps/api/prisma/schema/$id.prisma"
if [ -f "$schema" ]; then
  echo "Tables ($id.prisma)"
  unmapped=$(awk '/^model /{name=$2; inside=1; has=0; next} inside && /@@map\(/{has=1} inside && /^}/{if (!has) print name; inside=0}' "$schema")
  if [ -z "$unmapped" ]; then ok "every model has @@map"; else miss "models without @@map: $(printf '%s' "$unmapped" | tr '\n' ' ')"; fi
  bad=$(grep -o '@@map("[^"]*")' "$schema" | grep -v "@@map(\"${id}_" || true)
  if [ -z "$bad" ]; then ok "every table name is prefixed ${id}_"; else miss "tables not prefixed ${id}_: $(printf '%s' "$bad" | tr '\n' ' ')"; fi
fi

echo "Workers (apps/workers), only if the tool has Python jobs"
if [ -d "$ROOT/apps/workers/worker/tools/$id" ]; then
  ok "worker/tools/$id exists"
  check_text "worker.tools.$id" "apps/workers/worker/__main__.py" "list the tool in _tools()"
else
  echo "  none  worker/tools/$id (no Python handlers)"
fi

exit $fail
