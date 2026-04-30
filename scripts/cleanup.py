#!/usr/bin/env python3
"""
Remove a per-issue worktree and local branch after the linked PR is merged.

By default, requires the PR for branch issue/<N> to be merged (via gh).
Use --force to skip the merge check (local cleanup only).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=check, text=True, capture_output=True)


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


def parse_issue_number(raw: str) -> int:
    s = raw.strip().lstrip("#")
    if not s.isdigit():
        raise ValueError(f"Invalid issue id: {raw!r}")
    return int(s)


def branch_merged_into(repo: Path, branch: str, base: str) -> bool:
    proc = run(
        ["git", "-C", str(repo), "branch", "--merged", base],
        check=False,
    )
    if proc.returncode != 0:
        return False
    names = {line.strip().lstrip("* ").strip() for line in proc.stdout.splitlines()}
    return branch in names


def pr_merged_for_head(branch: str) -> bool:
    proc = run(
        ["gh", "pr", "list", "--head", branch, "--state", "merged", "--json", "number"],
        check=False,
    )
    if proc.returncode != 0:
        return False

    data = json.loads(proc.stdout or "[]")
    return len(data) > 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Remove issue worktree and local branch after PR merge.",
    )
    parser.add_argument("issue_id", help="Issue number (e.g. 42 or #42).")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip GitHub merge check and remove worktree/branch if present.",
    )
    parser.add_argument(
        "--base",
        default="main",
        help="Local branch name for merge detection hint (default: main).",
    )
    args = parser.parse_args()

    try:
        issue_num = parse_issue_number(args.issue_id)
    except ValueError as e:
        print(e, file=sys.stderr)
        return 2

    try:
        repo = git_repo_root()
    except RuntimeError as e:
        print(e, file=sys.stderr)
        return 1

    branch = f"issue/{issue_num}"
    worktree_path = (repo.parent / "worktrees" / f"issue-{issue_num}").resolve()

    if not args.force:
        if not pr_merged_for_head(branch):
            if branch_merged_into(repo, branch, args.base):
                print(
                    f"Branch {branch!r} is merged into local {args.base!r} but no merged PR found via gh. "
                    "Use --force if you are sure.",
                    file=sys.stderr,
                )
            else:
                print(
                    f"No merged PR found for head {branch!r}. Merge the PR first, or pass --force.",
                    file=sys.stderr,
                )
            return 1

    if worktree_path.is_dir():
        rm = run(
            ["git", "-C", str(repo), "worktree", "remove", str(worktree_path)],
            check=False,
        )
        if rm.returncode != 0:
            print(
                rm.stderr.strip() or rm.stdout.strip() or "git worktree remove failed; try --force on remove:",
                file=sys.stderr,
            )
            force_rm = run(
                ["git", "-C", str(repo), "worktree", "remove", "--force", str(worktree_path)],
                check=False,
            )
            if force_rm.returncode != 0:
                print(force_rm.stderr.strip() or "git worktree remove --force failed", file=sys.stderr)
                return 1
    else:
        print(f"No worktree directory at {worktree_path} (skipped).")

    prune = run(["git", "-C", str(repo), "worktree", "prune"], check=False)
    if prune.returncode != 0:
        print(prune.stderr.strip() or "git worktree prune warning", file=sys.stderr)

    delb = run(["git", "-C", str(repo), "branch", "-d", branch], check=False)
    if delb.returncode != 0:
        print(
            delb.stderr.strip() or f"Could not delete branch {branch!r} (may need -D or branch checked out elsewhere).",
            file=sys.stderr,
        )
        return 1

    print(f"Cleaned up worktree for issue #{issue_num} and deleted local branch {branch!r}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
