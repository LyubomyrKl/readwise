---
name: workers-test
description: "Run the Python worker tests (pytest for apps/workers, including the pydantic contract tests against the fixtures in packages/contracts) the only way that works on this Mac: inside a python:3.11-slim container through scripts/test-workers.sh, never with the host's Python 3.9 or 3.13; then read the result and say whether a failure is in the worker code, in the contracts (schema, fixtures or one of the two mirrors) or in Docker not running. Use it whenever the user says \"run the worker tests\", \"run pytest\", \"python tests\", \"test the workers\", \"test:workers\", \"are the workers green\", \"did the contracts break\", or pastes test-workers output and asks what broke; also after any change under apps/workers or packages/contracts, even when they only ask to verify or finish it. Not for the full pre-push sweep (/checks), the jest suites (npm test) or the end-to-end smoke script (npm run smoke)."
argument-hint: "[pytest arguments, e.g. -k contracts]"
allowed-tools: Bash(scripts/test-workers.sh:*), Bash(./scripts/test-workers.sh:*), Bash(npm run test:workers:*), Bash(docker info:*)
---

# Workers test

The workers (`apps/workers`) require Python 3.11 (`pyproject.toml`) and ship in `python:3.11-slim` (`apps/workers/Dockerfile`), but this Mac has only 3.9 and 3.13, so a host `pytest` or `pip install` either refuses the package or tests an interpreter production never runs. `./scripts/test-workers.sh` runs pytest inside the production image with the pinned dependencies and the repository root mounted, because `tests/test_contracts.py` reads the shared fixtures in `packages/contracts/jobs/fixtures`. Without this a session builds venvs that cannot work, or reads a Docker error as a red suite; with it the only question left after a run is which of three things a failure belongs to.

## Before you start

- Docker Desktop must be running: `docker info --format '{{.ServerVersion}}'` answers in a second with a version, or with `Cannot connect to the Docker daemon` when it is not. Nothing runs without it: say so, start it (`open -a Docker`, then wait until `docker info` answers) or ask the user to, and only then run. Do not fall back to the host's Python: a result from 3.9 or 3.13 is not the result CI gets (`.github/workflows/ci.yml` uses 3.11).
- Give the Bash call a 10-minute timeout or run it in the background. Every run reinstalls the package into a fresh container (about 20 seconds with a warm pip cache in the `readvise-pipcache` volume, measured on 2026-10-29: 101 tests, 3 seconds of pytest); the first run on a machine also pulls the image and downloads the scientific wheels, which takes minutes.
- Read the header comment of `./scripts/test-workers.sh` instead of reconstructing its `docker run`: the mount, the working directory and the cache volume are the whole trick.

## Steps

1. From the repository root:
   ```
   ./scripts/test-workers.sh $ARGUMENTS
   ```
   `npm run test:workers` is the same script. Extra arguments go to pytest (`-k contracts`, `-vv`, `-x`, `tests/test_runner.py`); use them to iterate on one failure, then run the whole suite before calling anything green, because the handler tests share the fakes in `tests/conftest.py` and a fix in one place can break another.
2. Read the whole output before deciding anything: the first error is usually the cause and pytest's last line says how many failed. Then put the failure in one of three places:
   - **Docker not up.** `Cannot connect to the Docker daemon`, `docker: command not found`, `Error response from daemon`, an image pull or the `pip install` failing on the network, no pytest output at all. The tests did not run, so nothing is known about the code; start Docker Desktop (or restore the network) and rerun. A `pip` resolution error counts as a code problem only when the diff touched `apps/workers/pyproject.toml`.
   - **Contracts.** Failures in `tests/test_contracts.py`, with ids like `[envelope.extract.json]`, `[event.waiting.json]`, `[control.cancel.json]`: the pydantic mirror `apps/workers/worker/platform/contracts.py` disagrees with a fixture in `packages/contracts/jobs/fixtures/valid` or `invalid`. A valid fixture rejected (often `extra_forbidden`, a field the mirror does not know) means the schema moved and the mirror did not, or the fixture is wrong; an invalid fixture accepted means the mirror is looser than the schema. `packages/contracts/README.md` gives the order: schema and fixtures first, then both mirrors. The zod mirror `apps/api/src/platform/jobs/contracts.ts` runs the same fixtures in `contracts.spec.ts`, so a contracts change is finished only when `npm test --workspace apps/api -- contracts` is green too. `no valid fixtures found` is not a contracts bug: the fixtures were not reachable, which the script's root mount exists to prevent.
   - **Worker code.** Any other failing test: the code under `apps/workers/worker`, or the test itself if it changed. The test file names the module (`test_runner.py`, `test_checkpoint.py`, `test_s3_storage.py` for `worker/platform`; the handler, pipeline and builder tests for `worker/tools/reader`). The suite runs against the fakes in `tests/conftest.py` and never reaches RabbitMQ, MinIO, Ollama or the network, so a connection error inside a test means code bypassed a fake, not that infrastructure is missing.
3. Rerun only with a reason to expect a different result. A test that passes on the second try is a finding to report, not a pass.
4. Fix only when asked, or when the change under test was the task; then rerun the failing test with `-k`, then the whole suite.

## Report

Outcome first: green with pytest's count line (`67 passed in 3.2s`), or red with the place in the first sentence: worker code, contracts, or Docker. For red, the failing test ids or the first error verbatim in a code block, then the file to look at. If Docker was down, say the tests did not run; never present that as a red suite. Say which arguments were used: a `-k` subset passing is not a green suite. After a contracts change, say whether the API side was run too.

## Pitfalls

- `pytest` or `pip install -e .` with the Mac's own Python: 3.9 refuses the package (`requires-python = ">=3.11"`), 3.13 may install and pass where 3.11 does not. The `workbench_workers.egg-info` folder under `apps/workers` is left behind by the container's editable install and is harmless.
- A contracts fix that passes here can still fail on the API side, or the other way round, because each mirror is hand-written; the fixtures are the only thing they share.
- The repository is mounted, so a fix on the host is visible to the next run without rebuilding anything; there is no image to rebuild for tests.
