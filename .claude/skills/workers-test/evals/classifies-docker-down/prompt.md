---
tags: [workers-test]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Are the worker tests failing? This is what I got:

```
$ npm run test:workers

> test:workers
> scripts/test-workers.sh

docker: Cannot connect to the Docker daemon at unix:///Users/me/.docker/run/docker.sock. Is the docker daemon running?

See 'docker run --help'.
```
