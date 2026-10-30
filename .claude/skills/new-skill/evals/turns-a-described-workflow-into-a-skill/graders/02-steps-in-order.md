---
type: llm
focus: trace
weight: 1
---

The body lists, in this order: generating two secrets with openssl rand -hex 32, setting JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in the root .env, running docker compose up -d api web, signing in again
