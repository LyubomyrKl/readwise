---
tags: [new-skill]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

earlier today I rotated the JWT secrets by hand and it took me three tries to remember the order: generate two new values with `openssl rand -hex 32`, put them in the root .env as JWT_ACCESS_SECRET and JWT_REFRESH_SECRET, `docker compose up -d api web` so both pick them up, then sign in again on every device because every session dies. turn that into a skill so I don't have to think about it again. it must not run on its own, I want to start it myself
