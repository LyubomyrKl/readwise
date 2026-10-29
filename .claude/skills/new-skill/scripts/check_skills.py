#!/usr/bin/env python3
"""Validate Claude Code skills: frontmatter, description budget, referenced files, scripts, evals.

    check_skills.py                 every skill under .claude/skills of the current repository
    check_skills.py <dir> ...       the given skill folders, or folders of skills

Errors (exit 1): no SKILL.md, broken frontmatter, bad name, missing or oversized description,
body over 500 lines, a scripts/ references/ assets/ or .claude/skills/ path mentioned in the body
that does not exist, a script that does not parse, an eval case missing one of its files,
two skills with the same name. Warnings do not fail the run.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

KNOWN_FIELDS = {
    "name", "description", "when_to_use", "argument-hint", "arguments", "disable-model-invocation",
    "user-invocable", "allowed-tools", "disallowed-tools", "model", "effort", "context", "agent",
    "background", "hooks", "paths", "shell", "metadata", "license", "compatibility", "version",
}
NAME_RE = re.compile(r"^[a-z][a-z0-9-]*$")
DESCRIPTION_BUDGET = 1536
BODY_MAX_LINES = 500
BODY_WARN_LINES = 200
LOCAL_REF_RE = re.compile(r"(?<![\w/.-])((?:scripts|references|assets)/[\w./-]+)")
REPO_REF_RE = re.compile(r"(?<![\w/])(\.claude/skills/[\w./-]+)")
ARGS_RE = re.compile(r"\$ARGUMENTS|\$\d|\$[a-z_]+\b")
DYNAMIC_RE = re.compile(r"(?:^|\s)!`([^`]*)`", re.MULTILINE)
RESERVED_CASE_NAMES = {"results", "mocks", "node_modules", "files", "true", "false", "null"}


def repo_root() -> Path:
    try:
        out = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True)
        return Path(out.stdout.strip())
    except (OSError, subprocess.CalledProcessError):
        return Path.cwd()


def parse_frontmatter(text: str) -> tuple[dict[str, str] | None, list[str], str | None]:
    """Returns (fields, body_lines, error). A deliberately small YAML subset: `key: value`,
    quoted or not, with indented continuation lines; enough for a SKILL.md header."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None, lines, "the first line must be --- (frontmatter opens the file)"
    fields: dict[str, str] = {}
    last_key: str | None = None
    for index in range(1, len(lines)):
        line = lines[index]
        if line.strip() == "---":
            return fields, lines[index + 1:], None
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line[0] in " \t" and last_key:
            fields[last_key] += " " + line.strip()
            continue
        match = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if not match:
            return None, lines, f"line {index + 1} of the frontmatter is not `key: value`: {line!r}"
        key, value = match.group(1), match.group(2).strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        fields[key] = value
        last_key = key
    return None, lines, "the frontmatter never closes (no second ---)"


class Report:
    def __init__(self, skill: Path) -> None:
        self.skill = skill
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)


def check_scripts(skill: Path, report: Report) -> None:
    scripts = skill / "scripts"
    if not scripts.is_dir():
        return
    for script in sorted(scripts.iterdir()):
        if script.is_dir() or script.name.startswith("."):
            continue
        if not os.access(script, os.X_OK):
            report.warn(f"{script.relative_to(skill)} is not executable (chmod +x)")
        if script.suffix == ".py":
            result = subprocess.run([sys.executable, "-m", "py_compile", str(script)], capture_output=True, text=True)
            if result.returncode != 0:
                report.error(f"{script.relative_to(skill)} does not compile: {result.stderr.strip().splitlines()[-1] if result.stderr.strip() else 'py_compile failed'}")
        elif script.suffix == ".sh":
            result = subprocess.run(["bash", "-n", str(script)], capture_output=True, text=True)
            if result.returncode != 0:
                report.error(f"{script.relative_to(skill)} does not parse: {result.stderr.strip()}")


def check_references(skill: Path, body: str, report: Report) -> None:
    root = repo_root()
    for match in LOCAL_REF_RE.finditer(body):
        ref = match.group(1).rstrip(".,:;)")
        if not (skill / ref).exists() and not (root / ref).exists():
            report.error(f"the body mentions {ref} but it exists neither in the skill folder nor at the repository root")
    for match in REPO_REF_RE.finditer(body):
        ref = match.group(1).rstrip(".,:;)")
        if "<" in ref or ">" in ref:
            continue
        if not (root / ref).exists():
            report.error(f"the body mentions {ref} but it does not exist in the repository")


def check_evals(skill: Path, report: Report) -> None:
    evals = skill / "evals"
    if not evals.is_dir():
        return
    cases = [d for d in sorted(evals.iterdir()) if d.is_dir() and d.name not in {"results", "files", "mocks", "node_modules"}]
    if not cases:
        report.warn("evals/ has no case folder")
    for case in cases:
        rel = case.relative_to(skill)
        if not NAME_RE.match(case.name) or case.name in RESERVED_CASE_NAMES:
            report.error(f"{rel}: case name must be lowercase letters, digits and hyphens, and not a reserved word")
        prompt = case / "prompt.md"
        if not prompt.exists():
            report.error(f"{rel}: prompt.md missing")
        else:
            text = prompt.read_text()
            if not text.startswith("---"):
                report.error(f"{rel}/prompt.md must start with the settings block (---)")
            elif "<replace" in text:
                report.warn(f"{rel}/prompt.md still has the scaffold placeholder")
        case_yaml = case / "case.yaml"
        if not case_yaml.exists():
            report.error(f"{rel}: case.yaml missing")
        else:
            text = case_yaml.read_text()
            if not re.search(r'^schema_version:\s*"1\.\d+"', text, re.MULTILINE):
                report.error(f"{rel}/case.yaml needs a quoted schema_version (schema_version: \"1.1\")")
            name_match = re.search(r"^name:\s*(\S+)", text, re.MULTILINE)
            if not name_match or name_match.group(1) != case.name:
                report.error(f"{rel}/case.yaml: name must equal the folder name {case.name}")
            if "<replace" in text:
                report.warn(f"{rel}/case.yaml still has the scaffold placeholder")
        graders = sorted((case / "graders").glob("*.md")) if (case / "graders").is_dir() else []
        if not graders:
            report.error(f"{rel}: graders/ needs at least one .md file (a case with no grader fails to load)")
        for grader in graders:
            text = grader.read_text()
            if not text.startswith("---") or not re.search(r"^type:", text, re.MULTILINE):
                report.error(f"{rel}/graders/{grader.name} needs the block with type:, focus:, weight: on top")


def check_skill(skill: Path) -> Report:
    report = Report(skill)
    skill_md = skill / "SKILL.md"
    if not skill_md.exists():
        report.error("no SKILL.md")
        return report
    text = skill_md.read_text()
    fields, body_lines, error = parse_frontmatter(text)
    if error:
        report.error(error)
        return report
    assert fields is not None
    body = "\n".join(body_lines)

    name = fields.get("name")
    if name is None:
        report.warn("no name field; the folder name is used, which is fine, but say it")
        name = skill.name
    if name != skill.name:
        report.error(f"name {name!r} differs from the folder name {skill.name!r}; keep them equal")
    if not NAME_RE.match(name):
        report.error(f"name {name!r} must be lowercase letters, digits and hyphens, starting with a letter")

    description = fields.get("description", "")
    if not description.strip():
        report.error("no description; it is the trigger, nothing loads without it")
    else:
        total = len(description) + len(fields.get("when_to_use", ""))
        if total > DESCRIPTION_BUDGET:
            report.error(f"description + when_to_use is {total} characters; the listing truncates at {DESCRIPTION_BUDGET}")
        elif total < 60:
            report.warn("the description is short; say what the skill does and which phrases should trigger it")
        elif not re.search(r"\b(use|when|whenever|trigger)\b", description, re.IGNORECASE):
            report.warn("the description never says when to use the skill; Claude under-triggers without that")

    for key in fields:
        if key not in KNOWN_FIELDS:
            report.warn(f"frontmatter field {key!r} is not one Claude Code reads (see references/frontmatter.md of new-skill)")

    count = len([line for line in body_lines if line.strip()]) if body_lines else 0
    if count == 0:
        report.error("the body is empty")
    elif len(body_lines) > BODY_MAX_LINES:
        report.error(f"the body is {len(body_lines)} lines; keep SKILL.md under {BODY_MAX_LINES} and move material to references/")
    elif len(body_lines) > BODY_WARN_LINES:
        report.warn(f"the body is {len(body_lines)} lines; consider moving material to references/")

    if ARGS_RE.search(body) and not fields.get("argument-hint") and not fields.get("arguments"):
        if re.search(r"\$ARGUMENTS|\$\d", body):
            report.warn("the body uses $ARGUMENTS/$N but the frontmatter declares no argument-hint")
    allowed_prefixes = [m.group(1).strip() for m in re.finditer(r"Bash\(([^)]*)\)", fields.get("allowed-tools", ""))]
    model_invocable = fields.get("disable-model-invocation", "false").strip().lower() not in {"true", "yes", "on", "1"}
    for match in DYNAMIC_RE.finditer(body):
        command = match.group(1)
        if model_invocable:
            report.warn(f"dynamic command `{command[:40]}` in a skill Claude may invoke itself: that path fails in headless runs; set disable-model-invocation: true or tell the reader to open the file instead")
        if "|| true" not in command:
            report.warn(f"dynamic command `{command[:40]}` has no `|| true`; a non-zero exit aborts the invocation")
        for segment in re.split(r"\|\||&&|;|\|", command):
            words = segment.strip().split()
            if not words:
                continue
            covered = any(
                prefix.rstrip("*").rstrip(":") == " ".join(words[: len(prefix.rstrip("*").rstrip(":").split())])
                for prefix in allowed_prefixes
            )
            if not covered:
                report.error(f"dynamic command segment `{segment.strip()}` is not covered by allowed-tools (every segment, `true` included, needs a Bash(...) rule, or the invocation aborts)")

    check_references(skill, body, report)
    check_scripts(skill, report)
    check_evals(skill, report)
    return report


def collect(paths: list[str]) -> list[Path]:
    if not paths:
        base = repo_root() / ".claude" / "skills"
        if not base.is_dir():
            print(f"check_skills: {base} does not exist", file=sys.stderr)
            sys.exit(2)
        return sorted(d for d in base.iterdir() if d.is_dir() and not d.name.startswith("."))
    skills: list[Path] = []
    for raw in paths:
        path = Path(raw).expanduser().resolve()
        if (path / "SKILL.md").exists():
            skills.append(path)
        elif path.is_dir():
            skills.extend(sorted(d for d in path.iterdir() if d.is_dir() and (d / "SKILL.md").exists()))
        else:
            print(f"check_skills: {path} is not a skill folder", file=sys.stderr)
            sys.exit(2)
    return skills


def main() -> None:
    skills = collect(sys.argv[1:])
    if not skills:
        print("check_skills: no skills found")
        sys.exit(2)
    reports = [check_skill(skill) for skill in skills]
    seen: dict[str, Path] = {}
    for report in reports:
        fields, _, _ = parse_frontmatter((report.skill / "SKILL.md").read_text()) if (report.skill / "SKILL.md").exists() else (None, [], None)
        name = (fields or {}).get("name", report.skill.name)
        if name in seen:
            report.error(f"name {name!r} is also used by {seen[name]}")
        seen.setdefault(name, report.skill)

    failed = 0
    for report in reports:
        status = "FAIL" if report.errors else ("warn" if report.warnings else "ok")
        print(f"{status:4}  {report.skill.name}")
        for message in report.errors:
            print(f"        error: {message}")
        for message in report.warnings:
            print(f"        warning: {message}")
        failed += bool(report.errors)
    print(f"{len(reports)} skill(s), {failed} with errors")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
