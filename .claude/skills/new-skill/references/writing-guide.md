# Writing a SKILL.md that works

## Layout

```
<name>/
├── SKILL.md          frontmatter (name, description) + the body
├── scripts/          executables for the deterministic parts; usage comment on top
├── references/       material loaded only when the body says "read X when Y"
├── assets/           templates and files copied into output
└── evals/<case>/     test cases: prompt.md, case.yaml, graders/*.md
```

Three loading levels: the description is always in context, the body on trigger, the rest on demand. A reference file over 300 lines gets a table of contents at the top.

## Voice

- Imperative sentences. "Run the drift check before the commit, because a schema edit without a migration passes typecheck and fails only in Docker." The second half of that sentence is what makes the instruction survive a case the first half did not foresee.
- Prefer the reason to the rule. `MUST`, `ALWAYS`, `NEVER` in capitals are a sign the reason is missing; write the reason, then the rule in normal words.
- Address a capable colleague who has not seen this repo. Do not explain git; do explain what is peculiar here.
- General, not overfitted. A skill written against one example works only for that example; describe the shape of the problem and the pattern of the solution.

## What goes where

- Repo facts the reader can look up: give the path (`apps/api/src/tool-registry.ts`), not the content. Copies go stale; the file does not. A path starting with `scripts/`, `references/` or `assets/` is read as the skill's own folder first and the repository root second, so `scripts/test-workers.sh` (repo) and `scripts/db-check.sh` (skill) both validate as long as the file exists.
- Commands: exact, in a code block, from the repository root unless said otherwise.
- Long material (a template, a table of fields, a format spec): a file under `references/` with a one-line pointer and the condition for reading it.
- Anything run the same way every time: a script. A skill that says "then write a helper that does X" makes every invocation rewrite X.
- Output expectations: a Report section at the end saying what to tell the user, outcome first.

## The description

The description is the only thing Claude sees before deciding to use the skill. Pattern: what it does, then when to use it, then the phrases, then what it is not for if a neighbour exists.

Thin:

> Run the project's tests.

Works:

> Run this repository's pre-push checks in the right order and report what is green and what failed, with the failing output: lint, typecheck, unit tests, API e2e, the money ledger specs against a throwaway Postgres. Use it whenever the user says "run the checks", "is it green", "ready to push", "verify", or before declaring any change finished, even if they name only one check.

Claude under-triggers, so include the casual phrasings and the cases where the user does not name the skill. Keep "when to use" out of the body.

## Signs a skill needs work

- Over 150 lines, or the reader has to scroll to find the steps.
- Instructions that restate what the repo's README or CLAUDE.md already say, instead of pointing there.
- Steps nobody follows because the reason is missing.
- The transcripts of its runs show the same helper being rewritten each time (bundle it), or time spent on something the skill asked for that did not help the result (cut it).
- It has never been run on a real prompt.
