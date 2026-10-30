# SKILL.md frontmatter

The opening `---` must be the first line of the file. Unknown field names are ignored silently, so spelling matters. Every field is optional; `description` is the one that matters.

| Field | Meaning |
|---|---|
| `name` | The slash command. Defaults to the folder name; keep them equal. Lowercase letters, digits, hyphens. |
| `description` | What the skill does and when to use it. The trigger. Truncated at 1,536 characters together with `when_to_use`. |
| `when_to_use` | Extra trigger context, appended to the description in the listing. Usually fold it into the description. |
| `argument-hint` | Autocomplete hint, e.g. `"[issue-number]"`. Declare it whenever the body uses `$ARGUMENTS`, `$0`, `$1`. |
| `arguments` | Named positional arguments (`arguments: [issue, branch]` makes `$issue` and `$branch`). |
| `disable-model-invocation` | `true` stops Claude from loading the skill on its own; only `/name` runs it. For skills with side effects the user wants to start deliberately. |
| `user-invocable` | `false` hides the skill from the `/` menu; only Claude triggers it. For background knowledge skills. |
| `allowed-tools` | Tools (permission-rule syntax, e.g. `Bash(npm test:*)`) Claude may use without asking during the turn that invokes the skill. Also pre-approves the `` !`command` `` injections. |
| `disallowed-tools` | Tools removed while the skill is active. |
| `model`, `effort` | Overrides for the invoking turn. Leave unset unless the skill needs them. |
| `context: fork` | Runs the skill in a forked subagent; `agent` picks the subagent type, `background: false` waits for it. |
| `paths` | Glob patterns; the skill loads automatically only for files that match. |
| `hooks` | Hooks registered when the skill is invoked and kept for the session. |
| `shell` | `bash` (default) or `powershell` for the injected commands. |
| `metadata`, `license`, `compatibility` | Spec fields Claude Code accepts but does not act on. |

## Argument substitution

`$ARGUMENTS` is the whole argument string; `$ARGUMENTS[0]` or `$0` the first word (shell quoting applies, so `"hello world"` is one argument). If the body has no placeholder, the arguments are appended as `ARGUMENTS: <value>`. Escape a literal dollar before a digit as `\$1`.

## Dynamic context

A line of the form below (an exclamation mark, then the command in backticks, written without the space shown here) runs before the body reaches Claude, and its output replaces the placeholder; a fenced block whose opening fence is followed by the exclamation mark does the same for several lines.

```
! `git status --short || true`
```

The mark is recognised at the start of a line or after whitespace, even in prose, so a SKILL.md must not spell the syntax out anywhere except where it means it. The command must pass the permission rules or be listed in `allowed-tools`, segment by segment (`cat x || true` needs `Bash(cat:*)` and `Bash(true)`), and a non-zero exit aborts the invocation: append `|| true` to anything that may fail. Verified on 2026-10-29 with Claude Code 2.1.310: invoked by the user as `/name`, the injection works, in headless `claude -p` runs too, as long as every segment is allowed; invoked by Claude through the Skill tool, it fails in headless runs whatever is allowed, and the skill returns only `Execute skill: <name>`. So inject only in skills with `disable-model-invocation: true`; a skill Claude may trigger itself tells the reader to open the file instead.

## Where skills live

- `.claude/skills/<name>/SKILL.md` in a repository: loaded in sessions in that repository and in sub-directories, shared through git.
- `~/.claude/skills/<name>/SKILL.md`: the user's own, every project.
- Project skills win over user skills of the same name only in the sense that both are listed; avoid the clash.
