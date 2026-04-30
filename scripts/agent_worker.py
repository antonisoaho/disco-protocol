#!/usr/bin/env python3
"""
Create an isolated git worktree and branch for a GitHub Issue (Worker machine).

Usage (from repository root):
  python3 scripts/agent_worker.py 42

Creates: ../worktrees/issue-42/ on branch issue/42 based on the remote default branch.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


def run_git(repo: Path, args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        check=check,
        text=True,
        capture_output=True,
    )


def parse_issue_id(raw: str) -> int:
    s = raw.strip().lstrip("#")
    if not re.fullmatch(r"\d+", s):
        raise ValueError(f"Invalid issue id: {raw!r} (expected a number, e.g. 42 or #42)")
    return int(s)


def git_repo_root(start: Path | None = None) -> Path:
    cwd = start or Path.cwd()
    proc = subprocess.run(
        ["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError("Not inside a git repository (git rev-parse failed).")
    return Path(proc.stdout.strip()).resolve()


def remote_default_branch(repo: Path) -> str:
    proc = run_git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD"], check=False)
    if proc.returncode == 0 and proc.stdout.strip():
        ref = proc.stdout.strip()
        return ref.rsplit("/", 1)[-1]
    for fallback in ("main", "master"):
        if run_git(repo, ["rev-parse", "--verify", f"origin/{fallback}"], check=False).returncode == 0:
            return fallback
    raise RuntimeError(
        "Could not determine default branch. Add remote 'origin' or create origin/main (or origin/master)."
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Open a dedicated worktree and branch for a GitHub Issue (Worker).",
    )
    parser.add_argument(
        "issue_id",
        help="Issue number (e.g. 42 or #42).",
    )
    parser.add_argument(
        "--base",
        default=None,
        help="Override base ref (default: origin/<default-branch>).",
    )
    args = parser.parse_args()

    try:
        issue_num = parse_issue_id(args.issue_id)
    except ValueError as e:
        print(e, file=sys.stderr)
        return 2

    try:
        repo = git_repo_root()
    except RuntimeError as e:
        print(e, file=sys.stderr)
        return 1

    branch = f"issue/{issue_num}"
    worktrees_dir = (repo.parent / "worktrees").resolve()
    worktree_path = worktrees_dir / f"issue-{issue_num}"

    if worktree_path.exists():
        print(
            f"Worktree path already exists: {worktree_path}\n"
            "Remove it with scripts/cleanup.py after merge, or delete manually.",
            file=sys.stderr,
        )
        return 1

    if run_git(repo, ["rev-parse", "--verify", branch], check=False).returncode == 0:
        print(
            f"Branch {branch!r} already exists locally. Choose a new issue or delete the branch first.",
            file=sys.stderr,
        )
        return 1

    default = remote_default_branch(repo)
    base_ref = args.base or f"origin/{default}"

    verify = run_git(repo, ["rev-parse", "--verify", base_ref], check=False)
    if verify.returncode != 0:
        print(
            f"Base ref {base_ref!r} not found. Fetch remotes: git fetch origin",
            file=sys.stderr,
        )
        return 1

    worktrees_dir.mkdir(parents=True, exist_ok=True)

    add = run_git(
        repo,
        ["worktree", "add", "-b", branch, str(worktree_path), base_ref],
        check=False,
    )
    if add.returncode != 0:
        print(add.stderr.strip() or add.stdout.strip() or "git worktree add failed", file=sys.stderr)
        return 1

    print(f"Issue:      #{issue_num}")
    print(f"Branch:     {branch}")
    print(f"Worktree:   {worktree_path}")
    print(f"Based on:   {base_ref}")
    print("\nNext: cd to the worktree and implement changes, then push and open a PR.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
