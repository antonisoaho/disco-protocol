#!/usr/bin/env python3
"""
Create and inspect GitHub Issues using the GitHub CLI (gh).

Requires: gh authenticated (gh auth login).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from typing import Any


def run_gh(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["gh", *args],
        check=check,
        text=True,
        capture_output=True,
    )


def create_issue(title: str, body: str, labels: list[str] | None = None) -> str:
    cmd = ["issue", "create", "--title", title, "--body", body]
    if labels:
        for label in labels:
            cmd.extend(["--label", label])
    proc = run_gh(cmd)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "gh issue create failed")
    return proc.stdout.strip()


def list_issues(
    state: str = "open",
    limit: int = 30,
) -> list[dict[str, Any]]:
    proc = run_gh(
        [
            "issue",
            "list",
            "--state",
            state,
            "--limit",
            str(limit),
            "--json",
            "number,title,state,labels,updatedAt,url",
        ]
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "gh issue list failed")
    return json.loads(proc.stdout or "[]")


def get_issue(issue_number: int) -> dict[str, Any]:
    proc = run_gh(
        [
            "issue",
            "view",
            str(issue_number),
            "--json",
            "number,title,state,body,labels,url,closedAt",
        ]
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"gh issue view {issue_number} failed")
    return json.loads(proc.stdout)


def print_issues_table(issues: list[dict[str, Any]]) -> None:
    if not issues:
        print("No issues.")
        return
    for i in issues:
        labels = ",".join(l["name"] for l in i.get("labels") or [])
        extra = f" [{labels}]" if labels else ""
        print(f"#{i['number']}\t{i['state']}\t{i['title']}{extra}\n  {i.get('url', '')}")


def main() -> int:
    parser = argparse.ArgumentParser(description="GitHub Issues via gh (orchestrator helper).")
    sub = parser.add_subparsers(dest="command", required=True)

    p_create = sub.add_parser("create", help="Create a new issue.")
    p_create.add_argument("--title", required=True)
    p_create.add_argument("--body", default="", help="Issue body (markdown).")
    p_create.add_argument(
        "--label",
        action="append",
        dest="labels",
        default=[],
        help="Label (repeatable).",
    )

    p_list = sub.add_parser("list", help="List issues.")
    p_list.add_argument(
        "--state",
        choices=("open", "closed", "all"),
        default="open",
    )
    p_list.add_argument("--limit", type=int, default=30)

    p_show = sub.add_parser("show", help="Show one issue as JSON.")
    p_show.add_argument("number", type=int)

    p_track = sub.add_parser(
        "track",
        help="Print a short status summary for open issues (orchestrator view).",
    )
    p_track.add_argument("--limit", type=int, default=50)

    args = parser.parse_args()

    try:
        if args.command == "create":
            url = create_issue(args.title, args.body, args.labels or None)
            print(url)
            return 0
        if args.command == "list":
            issues = list_issues(state=args.state, limit=args.limit)
            print_issues_table(issues)
            return 0
        if args.command == "show":
            data = get_issue(args.number)
            print(json.dumps(data, indent=2))
            return 0
        if args.command == "track":
            open_issues = list_issues(state="open", limit=args.limit)
            print(f"Open issues: {len(open_issues)}\n")
            print_issues_table(open_issues)
            return 0
    except RuntimeError as e:
        print(e, file=sys.stderr)
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
