# contracts

Message contracts shared by the API (TypeScript) and the workers (Python).
Nothing here is published; both sides keep a hand-written mirror and test it
against the fixtures in this directory, so a drift in either mirror fails CI.

## jobs

| File | Describes |
|---|---|
| `jobs/job-envelope.schema.json` | a job as published by the API to exchange `workbench.jobs`, routing key `jobs.<type>` |
| `jobs/job-event.schema.json` | a progress report from a worker to exchange `workbench.job-events`, routing key `job.<event>` |
| `jobs/job-control.schema.json` | a control message from the API to all workers (fanout `workbench.job-control`) |
| `jobs/fixtures/valid/*.json` | messages both mirrors must accept (`<schema>.<case>.json`) |
| `jobs/fixtures/invalid/*.json` | messages both mirrors must reject |

Mirrors and their tests:

- TypeScript: `apps/api/src/platform/jobs/contracts.ts` (zod), tested in `contracts.spec.ts`,
  which also validates the fixtures against the JSON Schema files with ajv.
- Python: `apps/workers/worker/platform/contracts.py` (pydantic), tested in `tests/test_contracts.py`.

Changing a contract: edit the schema, add fixtures, update both mirrors, bump `v`
only for incompatible changes (and keep accepting the old version for one release).
