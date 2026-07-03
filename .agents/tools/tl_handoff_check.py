#!/usr/bin/env python3
"""Preflight a TL implementation handoff before moving a card to PM review."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def run_git(args: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", *args],
        cwd=Path(__file__).resolve().parents[2],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if check and result.returncode != 0:
        raise SystemExit(result.stderr.strip() or result.stdout.strip())
    return result


def git_output(args: list[str]) -> str:
    return run_git(args).stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate final branch/commit evidence before TL sets a card to review."
    )
    parser.add_argument("--card", required=True, help="Feishu card id, for example WTJ-20260704-002")
    parser.add_argument("--branch", required=True, help="Delivery branch, for example tl/app-shell-v0")
    parser.add_argument("--base", default="main", help="PM-owned base branch, default: main")
    args = parser.parse_args()

    branch_commit = git_output(["rev-parse", "--verify", f"{args.branch}^{{commit}}"])
    base_commit = git_output(["rev-parse", "--verify", f"{args.base}^{{commit}}"])

    merge_base = git_output(["merge-base", args.base, args.branch])
    base_is_ancestor = run_git(["merge-base", "--is-ancestor", args.base, args.branch], check=False).returncode == 0

    changed_files = git_output(["diff", "--name-status", f"{merge_base}..{args.branch}"])
    if not changed_files:
        print(f"FAIL: {args.branch} has no diff against {args.base}.", file=sys.stderr)
        return 1

    short_commit = git_output(["rev-parse", "--short", args.branch])
    subject = git_output(["log", "-1", "--pretty=%s", args.branch])
    status = git_output(["status", "--short"])
    dirty_note = "none"
    if status:
        dirty_note = "shared worktree has local noise; not part of handoff unless listed in branch diff"

    print("TL HANDOFF PREFLIGHT PASS")
    print(f"card: {args.card}")
    print(f"base: {args.base}@{base_commit[:12]}")
    print(f"merge-base: {merge_base[:12]}")
    print(f"final branch: {args.branch}")
    print(f"final commit: {short_commit} {subject}")
    print("changed files:")
    for line in changed_files.splitlines():
        print(f"  {line}")
    if not base_is_ancestor:
        print("base note: PM-owned base has advanced after this branch started; PM will merge/rebase at acceptance if needed")
    print(f"worktree note: {dirty_note}")
    print("")
    print("Paste into Feishu 产物/证据 before setting the card to review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
