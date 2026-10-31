#!/usr/bin/env bash
# Run the Python worker tests under the same interpreter as the production image
# (python:3.11-slim) with the pinned requirements. Extra arguments go to pytest.
#
#   scripts/test-workers.sh
#   scripts/test-workers.sh -k runner -vv
#
# The repository root is mounted because the contract tests read
# packages/contracts/jobs/fixtures. A named Docker volume caches pip downloads.
# READER_BOOKS=<folder> mounts real books (read-only) for the opt-in real-book tests.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOOKS=()
if [ -n "${READER_BOOKS:-}" ]; then BOOKS=(-v "$READER_BOOKS":/books:ro -e READER_BOOKS=/books); fi
exec docker run --rm \
  -v readvise-pipcache:/root/.cache/pip \
  -v "$ROOT":/repo \
  ${BOOKS[@]+"${BOOKS[@]}"} \
  -w /repo/apps/workers \
  -e PYTHONDONTWRITEBYTECODE=1 \
  python:3.11-slim \
  sh -c 'pip install -q -e ".[dev]" && pytest -p no:cacheprovider "$@"' sh "$@"
