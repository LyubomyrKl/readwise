# Eval cases

A case is a folder under `evals/` in the skill, in the layout `claude plugin eval` reads. You can also run a case by hand: give the prompt to a fresh session (or a subagent) with and without the skill and grade the outputs against the graders.

```
evals/
└── flags-negative-quantity/        case name: lowercase, digits, hyphens; says what is tested
    ├── prompt.md                   settings block, then the prompt as the user would type it
    ├── case.yaml                   name and what a good result looks like
    ├── graders/01-....md           one verifiable statement per file
    └── files/                      input files, only if the case needs them
```

Do not name a case `results`, `mocks`, `node_modules`, `files`, `true`, `false` or `null`; the runner keeps those.

## prompt.md

```markdown
---
tags: [<skill-name>]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

<the prompt, exactly as a user would type it; concrete, with paths and context>
```

Only the runner reads the settings; an unknown key makes the case fail to load. Keep prose out of the block: it ends at the first `---` it meets.

## case.yaml

```yaml
schema_version: "1.1"
name: flags-negative-quantity
expected_outcome: |
  What a good result looks like, in plain words.
```

The version must be quoted or it reads as a number.

## graders/NN-few-words.md

```markdown
---
type: llm
focus: trace
weight: 1
---

SKILL.md of the new skill names scripts/test-workers.sh instead of copying it
```

One statement per file, numbered to keep the order, worded about the result itself. A case with no grader fails to load, so the scaffold writes `01-expected-output.md` with the body `The result matches this description: <expected outcome>`; replace it with real statements once you have them.

## Input files

Put them in `files/`, end the prompt with `Input files: a.csv, b.txt`, add `place-files.sh` next to `prompt.md`:

```bash
#!/usr/bin/env bash
set -eu
cp -R "$(dirname "$0")/files/." .
```

and name it in `case.yaml` under `context: { scaffold_script: place-files.sh }`.

## Running

```
claude plugin eval .claude/skills/<name> --allow-tools Write,Edit,Bash   # plus --scaffold when a case has files
```

Runs every case with and without the skill, writes a report under `evals/results/`. Billed model runs: offer, do not start unasked. Good prompts are substantive enough that a skill helps; a one-line "read this file" triggers nothing regardless of description.
