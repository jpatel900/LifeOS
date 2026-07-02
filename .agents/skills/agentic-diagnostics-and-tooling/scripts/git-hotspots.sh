#!/bin/sh
# git-hotspots.sh - print the most-churned files in the current git repo.
# Usage: git-hotspots.sh [TOP] [SINCE]
#   TOP   - number of files to print (default 20)
#   SINCE - optional git date filter, e.g. "90 days ago" or "2026-01-01"
# Dependencies: git + POSIX sh/sort/uniq/head/grep only.
# Run from anywhere inside the repo. Exit code 1 if not in a git repo.

TOP="${1:-20}"
SINCE="${2:-}"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
    echo "error: not inside a git repository" >&2
    exit 1
}

if [ -n "$SINCE" ]; then
    git log --since="$SINCE" --format= --name-only
else
    git log --format= --name-only
fi | grep -v '^$' | sort | uniq -c | sort -rn | head -n "$TOP"
