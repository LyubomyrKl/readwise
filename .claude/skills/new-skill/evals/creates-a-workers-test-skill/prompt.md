---
tags: [new-skill]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

I keep forgetting how we run the python worker tests in this repo (the Mac only has python 3.9 and 3.13, so they run in a python:3.11-slim container through scripts/test-workers.sh, and the pydantic contract fixtures under packages/contracts are part of what they check). Make me a skill called workers-test so next session Claude just knows: run them, and if something fails, tell me whether it's the worker code, the contracts, or docker not being up. Don't run the tests now.
