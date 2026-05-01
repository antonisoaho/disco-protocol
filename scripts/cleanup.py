#!/usr/bin/env python3
"""
Remove a per-issue worktree and local branch after the linked PR is merged.

By default, requires the PR for branch issue/<N> to be merged (via gh).
Use --force to skip safety and merge checks (local cleanup only).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=check, text=True, capture_output=True)


def run_git(repo: Path, args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return run(["git", "-C", str(repo), *args], check=check)


def git_repo_root(start: Path | None = None) -> Path:
    """
    Return the main repository root, even when launched inside a linked worktree.
    """
    cwd = start or Path.cwd()
    top = run(
        ["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
        check=False,
    )
    common = run(
        ["git", "-C", str(cwd), "rev-parse", "--git-common-dir"],
        check=False,
    )
    if top.returncode != 0 or common.returncode != 0:
        raise RuntimeError("Not inside a git repository (git rev-parse failed).")

    top_path = Path(top.stdout.strip())
    if not top_path.is_absolute():
        top_path = (cwd / top_path).resolve()
    else:
        top_path = top_path.resolve()

    common_path = Path(common.stdout.strip())
    if not common_path.is_absolute():
        common_path = (top_path / common_path).resolve()
    else:
        common_path = common_path.resolve()

    if common_path.name == ".git":
        return common_path.parent.resolve()
    return top_path


def parse_issue_number(raw: str) -> int:
    s = raw.strip().lstrip("#")
    if not s.isdigit():
        raise ValueError(f"Invalid issue id: {raw!r}")
    issue = int(s)
    if issue <= 0:
        raise ValueError(f"Invalid issue id: {raw!r}")
    return issue


def git_ref_exists(repo: Path, ref: str) -> bool:
    return run_git(repo, ["rev-parse", "--verify", ref], check=False).returncode == 0


def local_branch_exists(repo: Path, branch: str) -> bool:
    return git_ref_exists(repo, f"refs/heads/{branch}")


def remote_branch_exists(repo: Path, branch: str, *, remote: str = "origin") -> bool:
    return git_ref_exists(repo, f"refs/remotes/{remote}/{branch}")


def select_base_ref(repo: Path, base: str) -> str | None:
    for candidate in (f"origin/{base}", base):
        if git_ref_exists(repo, candidate):
            return candidate
    return None


def branch_merged_into(repo: Path, branch: str, base_ref: str) -> bool:
    proc = run_git(
        repo,
        ["merge-base", "--is-ancestor", branch, base_ref],
        check=False,
    )
    return proc.returncode == 0


def pr_merged_for_head(branch: str) -> bool:
    proc = run(
        ["gh", "pr", "list", "--head", branch, "--state", "merged", "--json", "number"],
        check=False,
    )
    if proc.returncode != 0:
        return False

    data = json.loads(proc.stdout or "[]")
    return len(data) > 0


def worktree_has_uncommitted_changes(worktree_path: Path) -> bool:
    proc = run(
        ["git", "-C", str(worktree_path), "status", "--porcelain"],
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "Failed to inspect worktree status.")
    return bool(proc.stdout.strip())


def unpushed_commit_count_against_remote(repo: Path, branch: str, *, remote: str = "origin") -> int:
    remote_branch = f"{remote}/{branch}"
    proc = run_git(
        repo,
        ["rev-list", "--left-right", "--count", f"{remote_branch}...{branch}"],
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "Failed to compare branch with remote.")

    parts = proc.stdout.strip().split()
    if len(parts) != 2:
        raise RuntimeError(f"Unexpected rev-list output: {proc.stdout.strip()!r}")
    return int(parts[1])


def commits_not_in_base(repo: Path, branch: str, base_ref: str) -> int:
    proc = run_git(repo, ["rev-list", "--count", f"{base_ref}..{branch}"], check=False)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "Failed to compare branch with base ref.")
    return int(proc.stdout.strip() or "0")


def log_action(message: str, *, dry_run: bool) -> None:
    if dry_run:
        print(f"[dry-run] {message}")
    else:
        print(message)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Remove issue worktree and local branch after PR merge.",
    )
    parser.add_argument("issue_id", help="Issue number (e.g. 42 or #42).")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip safety and merge checks; force remove worktree/branch if present.",
    )
    parser.add_argument(
        "--base",
        default="main",
        help="Base branch name for local merge checks (default: main).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be removed without modifying anything.",
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
    branch_exists = local_branch_exists(repo, branch)
    base_ref = select_base_ref(repo, args.base)

    if not args.force and worktree_path.is_dir():
        try:
            if worktree_has_uncommitted_changes(worktree_path):
                print(
                    f"Refusing cleanup: worktree has uncommitted changes: {worktree_path}\n"
                    "Commit/stash/discard changes, or pass --force.",
                    file=sys.stderr,
                )
                return 1
        except RuntimeError as e:
            print(f"Could not inspect worktree status at {worktree_path}: {e}", file=sys.stderr)
            return 1

    if not args.force and branch_exists:
        try:
            if remote_branch_exists(repo, branch):
                ahead = unpushed_commit_count_against_remote(repo, branch)
                if ahead > 0:
                    print(
                        f"Refusing cleanup: branch {branch!r} has {ahead} unpushed commit(s) "
                        f"ahead of origin/{branch}. Push first, or pass --force.",
                        file=sys.stderr,
                    )
                    return 1
            else:
                if base_ref is None:
                    print(
                        f"Refusing cleanup: origin/{args.base!r} (and local {args.base!r}) not found for "
                        f"unpushed-commit safety check on {branch!r}. Use --force if intentional.",
                        file=sys.stderr,
                    )
                    return 1
                pending = commits_not_in_base(repo, branch, base_ref)
                if pending > 0:
                    print(
                        f"Refusing cleanup: branch {branch!r} has {pending} commit(s) not in {base_ref!r} "
                        f"and no remote branch origin/{branch}. Push/merge first, or pass --force.",
                        file=sys.stderr,
                    )
                    return 1
        except RuntimeError as e:
            print(f"Could not verify unpushed commits for {branch!r}: {e}", file=sys.stderr)
            return 1

    if not args.force:
        if not pr_merged_for_head(branch):
            if base_ref and branch_exists and branch_merged_into(repo, branch, base_ref):
                print(
                    f"Branch {branch!r} is merged into {base_ref!r} but no merged PR found via gh. "
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
        if args.dry_run:
            log_action(f"Would remove worktree: {worktree_path}", dry_run=True)
        else:
            remove_cmd = ["worktree", "remove"]
            if args.force:
                remove_cmd.append("--force")
            remove_cmd.append(str(worktree_path))
            rm = run_git(repo, remove_cmd, check=False)
            if rm.returncode != 0:
                print(
                    rm.stderr.strip() or rm.stdout.strip() or "git worktree remove failed",
                    file=sys.stderr,
                )
                return 1
            print(f"Removed worktree: {worktree_path}")
    else:
        print(f"No worktree directory at {worktree_path} (skipped).")

    if args.dry_run:
        log_action("Would run: git worktree prune", dry_run=True)
    else:
        prune = run_git(repo, ["worktree", "prune"], check=False)
        if prune.returncode != 0:
            print(prune.stderr.strip() or "git worktree prune warning", file=sys.stderr)

    if branch_exists:
        delete_flag = "-D" if args.force else "-d"
        if args.dry_run:
            log_action(f"Would delete local branch with: git branch {delete_flag} {branch}", dry_run=True)
        else:
            delb = run_git(repo, ["branch", delete_flag, branch], check=False)
            if delb.returncode != 0:
                print(
                    delb.stderr.strip()
                    or f"Could not delete branch {branch!r} (it may be checked out elsewhere).",
                    file=sys.stderr,
                )
                return 1
            print(f"Deleted local branch {branch!r}.")
    else:
        print(f"Local branch {branch!r} does not exist (skipped).")

    if args.dry_run:
        print(f"Dry run complete for issue #{issue_num}.")
    else:
        print(f"Cleaned up worktree for issue #{issue_num}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
