#!/usr/bin/env bash
# Run the Python worker tests under the same interpreter as the production image
# (python:3.11-slim) with the pinned requirements. Extra arguments go to pytest.
#
#   scripts/test-workers.sh
#   scripts/test-workers.sh -k checkpoint -vv
#
# A named Docker volume caches pip downloads between runs.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec docker run --rm \
  -v readvise-pipcache:/root/.cache/pip \
  -v "$ROOT/apps/workers":/app \
  -w /app \
  python:3.11-slim \
  sh -c 'pip install -q -e ".[dev]" && pytest "$@"' sh "$@"
