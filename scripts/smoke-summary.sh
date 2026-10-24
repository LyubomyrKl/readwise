#!/usr/bin/env bash
# Smoke test for the summarizer path, end to end, against a running gateway:
#
#   register/login -> upload a two-page PDF -> request a summary ->
#   poll status until ready -> verify the stored type and strategy -> fetch the summary
#
# Prerequisites: curl, jq, and a running stack (gateway, workers, RabbitMQ,
# MinIO, Postgres) plus the Ollama host. A two-page fixture takes minutes, not hours.
#
# Usage:
#   scripts/smoke-summary.sh
#   API_URL=https://workbench.example/api STRATEGY=structured scripts/smoke-summary.sh
#
# Environment:
#   API_URL             gateway base URL including /api      (default: http://localhost:5173/api)
#   SMOKE_EMAIL         account to use; created when missing (default: smoke@workbench.local)
#   SMOKE_PASSWORD      password for that account            (default: smoke-pass-123)
#   SUMMARY_TYPE        extractive | abstractive             (default: abstractive)
#   STRATEGY            basic | structured | two_pass | chain_of_density | hybrid (default: two_pass)
#   SMOKE_WAIT_SECONDS  how long to wait for the summary     (default: 1800)
#   KEEP_BOOK=1         keep the uploaded book even on success
#
# On failure the book is left in place so it can be inspected in the UI.
# Exit codes: 0 pass, 1 assertion failed, 2 prerequisite missing.
set -euo pipefail

API_URL="${API_URL:-http://localhost:5173/api}"
SMOKE_EMAIL="${SMOKE_EMAIL:-smoke@workbench.local}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-smoke-pass-123}"
SUMMARY_TYPE="${SUMMARY_TYPE:-abstractive}"
STRATEGY="${STRATEGY:-two_pass}"
SMOKE_WAIT_SECONDS="${SMOKE_WAIT_SECONDS:-1800}"
POLL_INTERVAL=5

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PDF="$HERE/fixtures/sample-2p.pdf"

log()  { printf '%s %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
fail() { log "FAIL: $*"; exit 1; }

for tool in curl jq; do
  command -v "$tool" >/dev/null 2>&1 || { log "missing prerequisite: $tool"; exit 2; }
done
[ -f "$PDF" ] || { log "missing fixture $PDF (run scripts/fixtures/make-sample-pdf.py)"; exit 2; }

BODY=""
HTTP_STATUS=""
# call METHOD PATH [curl args...]  -> sets BODY and HTTP_STATUS
call() {
  local method="$1" path="$2"; shift 2
  local out
  out="$(curl -sS -X "$method" "$API_URL$path" -w $'\n%{http_code}' "$@")" || fail "curl $method $path failed"
  HTTP_STATUS="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
}
json() { jq -nc "$@"; }

TOKEN=""
BOOK_ID=""
PASSED=0
cleanup() {
  if [ -n "$BOOK_ID" ] && [ -n "$TOKEN" ]; then
    if [ "$PASSED" = "1" ] && [ "${KEEP_BOOK:-0}" != "1" ]; then
      call DELETE "/books/$BOOK_ID" -H "Authorization: Bearer $TOKEN" || true
      log "deleted book $BOOK_ID"
    else
      log "book $BOOK_ID left in place"
    fi
  fi
}
trap cleanup EXIT

log "gateway: $API_URL"
call GET /health
[ "$HTTP_STATUS" = "200" ] || fail "gateway not healthy (HTTP $HTTP_STATUS): $BODY"

# 1. account
call POST /auth/register -H 'Content-Type: application/json' \
  -d "$(json --arg e "$SMOKE_EMAIL" --arg p "$SMOKE_PASSWORD" '{email:$e,password:$p,name:"Smoke"}')"
case "$HTTP_STATUS" in
  200|201) log "registered $SMOKE_EMAIL" ;;
  409)     log "account $SMOKE_EMAIL exists" ;;
  *)       fail "register: HTTP $HTTP_STATUS $BODY" ;;
esac
call POST /auth/login -H 'Content-Type: application/json' \
  -d "$(json --arg e "$SMOKE_EMAIL" --arg p "$SMOKE_PASSWORD" '{email:$e,password:$p}')"
[ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ] || fail "login: HTTP $HTTP_STATUS $BODY"
TOKEN="$(jq -r '.tokens.accessToken // empty' <<<"$BODY")"
[ -n "$TOKEN" ] || fail "login response had no accessToken: $BODY"
AUTH=(-H "Authorization: Bearer $TOKEN")

# 2. upload
call POST /books/upload "${AUTH[@]}" \
  -F "book=@$PDF;type=application/pdf" \
  -F "title=Smoke test $(date +%Y-%m-%d_%H%M%S)" \
  -F "author=Smoke" \
  -F "description=Two-page fixture uploaded by scripts/smoke-summary.sh" \
  -F "pageCount=2"
[ "$HTTP_STATUS" = "201" ] || fail "upload: HTTP $HTTP_STATUS $BODY"
BOOK_ID="$(jq -r '.bookId // empty' <<<"$BODY")"
[ -n "$BOOK_ID" ] || fail "upload response had no bookId: $BODY"
log "uploaded book $BOOK_ID"

# 3. request the summary
call POST /summarizer/request "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "$(json --arg b "$BOOK_ID" --arg t "$SUMMARY_TYPE" --arg s "$STRATEGY" \
        '{bookId:$b,summaryType:$t,summarizationStrategy:$s}')"
[ "$HTTP_STATUS" = "201" ] || fail "request: HTTP $HTTP_STATUS $BODY"
[ "$(jq -r '.success' <<<"$BODY")" = "true" ] || fail "request not accepted: $BODY"
log "requested a $SUMMARY_TYPE summary with strategy $STRATEGY"

# 4. wait for the workers
deadline=$(( $(date +%s) + SMOKE_WAIT_SECONDS ))
last_status=""
while :; do
  call GET "/summarizer/status/$BOOK_ID" "${AUTH[@]}"
  [ "$HTTP_STATUS" = "200" ] || fail "status: HTTP $HTTP_STATUS $BODY"
  status="$(jq -r '.status' <<<"$BODY")"
  if [ "$status" != "$last_status" ]; then log "status: $status"; last_status="$status"; fi
  [ "$(jq -r '.isReady' <<<"$BODY")" = "true" ] && break
  [ "$status" = "error" ] && fail "summarization failed: $(jq -r '.errorMessage // "no error message recorded"' <<<"$BODY")"
  [ "$(date +%s)" -lt "$deadline" ] || fail "timed out after ${SMOKE_WAIT_SECONDS}s (are the workers and the Ollama host running?)"
  sleep "$POLL_INTERVAL"
done

# 5. the stored summary must carry the requested type and strategy
got_type="$(jq -r '.summaryType // empty' <<<"$BODY")"
got_strategy="$(jq -r '.summarizationStrategy // empty' <<<"$BODY")"
[ "$got_type" = "$SUMMARY_TYPE" ] || fail "stored summary type is '${got_type:-<none>}', expected '$SUMMARY_TYPE'"
[ "$got_strategy" = "$STRATEGY" ] || fail "stored strategy is '${got_strategy:-<none>}', expected '$STRATEGY' (the strategy was lost between the workers)"
log "stored type/strategy: $got_type/$got_strategy"

# 6. the summary itself
call POST /summarizer/summary "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "$(json --arg b "$BOOK_ID" '{bookId:$b}')"
[ "$HTTP_STATUS" = "201" ] || fail "summary: HTTP $HTTP_STATUS $BODY"
sections="$(jq -r '.summary.sections | length' <<<"$BODY" 2>/dev/null || echo 0)"
[ "$sections" -gt 0 ] 2>/dev/null || fail "summary has no sections: $(jq -c '.summary' <<<"$BODY" | cut -c1-300)"
log "summary has $sections section(s); first: $(jq -r '.summary.sections[0].title // "?"' <<<"$BODY")"

PASSED=1
log "PASS"
