#!/usr/bin/env python3
"""Scaffold a Claude Code skill folder from assets/SKILL.template.md.

    new_skill.py <name> --description "<what it does and when to use it>"
                 [--argument-hint "[x]"] [--with-eval <case-name>] [--title "..."]
                 [--dir <skills-dir> | --user]

Writes <skills-dir>/<name>/SKILL.md (and evals/<case>/ when asked), refuses to overwrite
anything, and prints what to do next. <skills-dir> defaults to .claude/skills of the git
repository that contains the current directory; --user targets ~/.claude/skills.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE.parent / "assets" / "SKILL.template.md"
NAME_RE = re.compile(r"^[a-z][a-z0-9-]*$")
RESERVED_CASE_NAMES = {"results", "mocks", "node_modules", "files", "true", "false", "null"}

PROMPT_MD = """---
tags: [{skill}]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

<replace with the prompt exactly as a user would type it: concrete, with paths and context>
"""

CASE_YAML = """schema_version: "1.1"
name: {case}
expected_outcome: |
  <replace with what a good result looks like, in plain words>
"""

GRADER_MD = """---
type: llm
focus: trace
weight: 1
---

The result matches this description: <the expected outcome from case.yaml>
"""


def repo_root() -> Path:
    try:
        out = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True)
        return Path(out.stdout.strip())
    except (OSError, subprocess.CalledProcessError):
        return Path.cwd()


def yaml_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def fail(message: str) -> None:
    print(f"new_skill: {message}", file=sys.stderr)
    sys.exit(2)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("name", help="skill name: lowercase letters, digits, hyphens; also the folder and the slash command")
    parser.add_argument("--description", required=True, help="what it does and when to use it (the trigger)")
    parser.add_argument("--argument-hint", default="", help='autocomplete hint, e.g. "[issue-number]"')
    parser.add_argument("--with-eval", metavar="CASE", help="also write evals/<CASE>/ with the three files a case needs")
    parser.add_argument("--title", help="heading of the body (default: the name with spaces)")
    where = parser.add_mutually_exclusive_group()
    where.add_argument("--dir", help="skills directory (default: <repo>/.claude/skills)")
    where.add_argument("--user", action="store_true", help="write to ~/.claude/skills instead")
    args = parser.parse_args()

    name = args.name.strip()
    if not NAME_RE.match(name):
        fail(f"name {name!r} must be lowercase letters, digits and hyphens, starting with a letter")
    description = " ".join(args.description.split())
    if not description:
        fail("the description is empty; it is the trigger, so it cannot be")
    if len(description) < 80:
        print("new_skill: the description is short; say what it does and list the phrases that should trigger it", file=sys.stderr)
    if len(description) > 1536:
        fail(f"the description is {len(description)} characters; the listing truncates at 1536")

    if args.dir:
        skills_dir = Path(args.dir).expanduser().resolve()
    elif args.user:
        skills_dir = Path.home() / ".claude" / "skills"
    else:
        skills_dir = repo_root() / ".claude" / "skills"
    skill_dir = skills_dir / name
    if skill_dir.exists():
        fail(f"{skill_dir} exists; revise it in place or pick another name")
    if not TEMPLATE.exists():
        fail(f"template missing: {TEMPLATE}")

    title = args.title or name.replace("-", " ").capitalize()
    extra = f"argument-hint: {yaml_quote(args.argument_hint.strip())}\n" if args.argument_hint.strip() else ""
    text = (
        TEMPLATE.read_text()
        .replace("{{name}}", name)
        .replace("{{description}}", yaml_quote(description))
        .replace("{{extra_frontmatter}}", extra)
        .replace("{{title}}", title)
    )

    created: list[Path] = []
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(text)
    created.append(skill_dir / "SKILL.md")

    if args.with_eval:
        case = args.with_eval.strip()
        if not NAME_RE.match(case) or case in RESERVED_CASE_NAMES:
            fail(f"case name {case!r} must be lowercase letters, digits and hyphens and not one of {sorted(RESERVED_CASE_NAMES)}")
        case_dir = skill_dir / "evals" / case
        (case_dir / "graders").mkdir(parents=True)
        for rel, body in (
            ("prompt.md", PROMPT_MD.format(skill=name)),
            ("case.yaml", CASE_YAML.format(case=case)),
            ("graders/01-expected-output.md", GRADER_MD),
        ):
            (case_dir / rel).write_text(body)
            created.append(case_dir / rel)

    print("created:")
    for path in created:
        print(f"  {path}")
    print("next:")
    print(f"  1. fill in {skill_dir / 'SKILL.md'} (replace every <!-- comment -->; delete sections you do not need)")
    if args.with_eval:
        print(f"  2. replace the placeholders in {skill_dir / 'evals' / args.with_eval}/ (prompt, expected outcome, graders)")
    print(f"  3. python3 {HERE / 'check_skills.py'} {skill_dir}")
    if skills_dir == repo_root() / ".claude" / "skills":
        print(f"  4. add a line to {skills_dir / 'README.md'}")


if __name__ == "__main__":
    main()
