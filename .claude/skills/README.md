# Skills

Project skills Claude Code loads in this repository, as `/name` or on their own when a task matches the description. Make or revise one with `/new-skill`; `python3 .claude/skills/new-skill/scripts/check_skills.py` validates them all.

| Skill | Use it for |
|---|---|
| `/checks [fast\|full\|db\|workers]` | the pre-push checks, with the money DB specs and the drift check against a throwaway Postgres (`checks/scripts/db-check.sh`) |
| `/workers-test [pytest args]` | the Python worker tests in the `python:3.11-slim` container (`scripts/test-workers.sh`), and whether a failure is the worker code, the contracts or Docker not running |
| `/new-tool <id>` | wiring a new tool on both sides; `new-tool/scripts/check_tool.sh <id>` says what is missing |
| `/endpoint <METHOD /path>` | an API endpoint from the controller to the query hook, with its tests |
| `/migration <name>` | a Prisma schema change through a migration generated against the throwaway database |
| `/money-session [task]` | a money milestone the way the plan prescribes, with the six rules in view |
| `/new-skill <name>` | scaffolding, writing, validating and testing a skill; this list |
