---
name: new-skill
description: Create a new Claude Code skill or revise an existing one, in this repository (.claude/skills/<name>/SKILL.md) or in the user's own ~/.claude/skills. Covers the whole job, deciding whether a skill is the right vehicle (versus a hook, a CLAUDE.md line or a plain script), capturing what it should do and when it should trigger, scaffolding the folder with scripts/new_skill.py, writing a lean SKILL.md whose description makes it trigger, validating every skill with scripts/check_skills.py, adding an eval case and smoke-testing it. Use it whenever the user says "make a skill", "turn this into a skill", "add a slash command", "/something should do X", "save this workflow for next time", "improve this skill", "why didn't the skill trigger", or asks how to reuse a procedure in a later session, even when they never say the word skill.
argument-hint: "[skill-name] [what it should do]"
---

# Make a skill

A skill is a folder with a `SKILL.md` that Claude reads when a task matches its description. Three budgets are spent in this order: the name and description sit in every session's context, so they must trigger at the right moment and nowhere else; the body loads when the skill triggers, so it must fit in one read; anything under `scripts/`, `references/` and `assets/` loads only when the body asks for it, so bulk goes there. A skill that would be used once is a wasted budget; one that a fresh session would otherwise rediscover by reading half the repo pays for itself every time.

## 1. Is a skill the right vehicle?

- "Every time X happens, do Y" belongs in a hook (`/update-config`). The harness runs hooks; Claude can only promise to remember.
- A one-sentence rule that should always hold belongs in `CLAUDE.md`.
- A command sequence with no judgement in it belongs in a script. The skill, if any, calls the script and adds the judgement around it.
- A procedure with judgement, used more than once, that depends on knowledge of this repo: that is a skill.

Say which of these you picked and why when it is not the one the user asked for, then do what they asked.

## 2. Capture the intent

Answer four questions before writing. Take the answers from the conversation when the workflow just happened in it (the commands used, the order, the corrections the user made); ask the user only for the gaps; in an autonomous run state the assumption and go on.

1. What should Claude be able to do with it? The outcome, not the steps.
2. When should it trigger? Collect the phrases the user would actually type, including the ones that do not name the skill, and the near-misses that must not trigger it.
3. What does a good result look like? Files, a report, a passing check.
4. Can the result be checked objectively? If yes, the skill gets an eval case (step 6).

## 3. Scaffold

```
python3 .claude/skills/new-skill/scripts/new_skill.py <name> --description "<what it does and when to use it>" \
    [--argument-hint "[x]"] [--with-eval <case-name>] [--user]
```

The name is the slash command and the folder: lowercase letters, digits, hyphens. The script copies `assets/SKILL.template.md`, fills the frontmatter, writes an eval case skeleton when asked, refuses to overwrite, and prints what to do next. `--user` targets `~/.claude/skills` for a skill the user wants in every project; the default is this repository's `.claude/skills`, which git shares.

## 4. Write the body

Read `references/writing-guide.md` once; the points that matter most:

- Explain why. A model that knows the reason behind a step handles the case the step did not foresee; a bare MUST does not. Capital-letter ALWAYS and NEVER are a sign the reason is missing.
- Imperative, lean, around 100 lines, hard ceiling 500. If it grows, add a `references/` file and a one-line pointer saying when to read it.
- Point at files in this repo by path instead of copying their content. The repo is the source of truth and copies go stale; the reader can open the file.
- Deterministic parts go in `scripts/` (executable, with a usage comment on top), templates in `assets/`.
- State the skill always needs at the start (a progress section, the git status) can be injected at invocation: a line that starts with an exclamation mark immediately followed by the command in backticks (the exact form is in `references/frontmatter.md`; do not write it in prose anywhere in a SKILL.md, because it runs wherever it appears). A failing command aborts the invocation, so append `|| true`; and because a command that is not pre-approved also aborts it, list every segment in `allowed-tools`, the command and the `true` (`Bash(cat:*), Bash(true)`). Use injection only in a skill the user starts (`disable-model-invocation: true`): when Claude invokes a skill itself, the injection fails in headless runs and the skill returns only an error (verified 2026-10-29, Claude Code 2.1.310). A skill Claude triggers on its own says "read file X first" instead; one Read call is the price. The validator checks both.
- End with a Report section: what to tell the user, outcome first.

### The description is the trigger

Lead with what the skill does, then the situations and phrases that should trigger it, including synonyms and the cases where the user does not name the skill. Claude under-triggers, so lean towards pushy; balance it by naming what the skill is not for when a neighbouring skill exists. The body is never seen before triggering, so "when to use" lives only in the description. Budget: 1,536 characters together with `when_to_use`.

## 5. Validate

```
python3 .claude/skills/new-skill/scripts/check_skills.py              # every skill in .claude/skills
python3 .claude/skills/new-skill/scripts/check_skills.py <skill-dir>  # one skill
```

It checks the frontmatter (first line, known fields, name matches the folder, description present and inside the budget), the body length, that every `scripts/`, `references/`, `assets/` and `.claude/skills/...` path the body mentions exists, that scripts parse and are executable, that arguments and dynamic commands are declared, and that each eval case has the three files the eval runner needs. Fix errors; read warnings.

## 6. Test it

- Write at least one eval case under `evals/<case>/` (format and a worked example in `references/evals.md`): a prompt a real user would type, the expected outcome in `case.yaml`, one grader file per verifiable statement.
- Dogfood a skill that wraps a script by running the script on a real input yourself before declaring it done.
- `claude plugin eval .claude/skills/<name> --allow-tools Write,Edit,Bash` runs the cases with and without the skill. The runs are billed, so offer it rather than start it unasked. For a measured comparison across iterations, with a viewer for the user's feedback, the global `anthropic-skills:skill-creator` skill has the full loop; use it when the user wants numbers.

## 7. Register and hand over

- Add a line to `.claude/skills/README.md`.
- Commit the folder with the change it supports. Touch `CLAUDE.md` only when the skill changes a rule written there.
- Tell the user the slash command, what triggers it on its own, and what was tested.

## Revising an existing skill

Read the `SKILL.md` and its evals first. Change the least that fixes the reported problem, then generalise: the feedback is about one case, the skill runs on many. Remove anything that no longer pulls its weight. Keep the name. Re-run the validator and the eval.
