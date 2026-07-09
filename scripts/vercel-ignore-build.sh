#!/usr/bin/env bash
# Vercel ignoreCommand: skip the build (exit 0) when every file changed in
# this push is docs/agent-instruction-only. Build (exit 1) for everything
# else, and always build when there's no parent commit to diff (shallow /
# first checkout) so we never silently skip out of caution.
#
# Conservative allowlist — skip ONLY when every changed file matches:
#   docs/**, root-level *.md, .agents/**, .github/**
# Anything under apps/**, packages/**, supabase/**, or root config files
# (package.json, pnpm-lock.yaml, turbo.json, vercel.json, this script
# itself) always forces a build.
set -uo pipefail

if ! git rev-parse HEAD^ >/dev/null 2>&1; then
  echo "No parent commit (fresh/shallow checkout); building to be safe."
  exit 1
fi

changed=$(git diff --name-only HEAD^ HEAD)

if [ -z "$changed" ]; then
  echo "No changed files detected; building to be safe."
  exit 1
fi

while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    docs/*) continue ;;
    .agents/*) continue ;;
    .github/*) continue ;;
    *.md)
      if [[ "$f" == */* ]]; then
        echo "Build-relevant change (nested markdown outside docs/**): $f"
        exit 1
      fi
      continue
      ;;
    *)
      echo "Build-relevant change: $f"
      exit 1
      ;;
  esac
done <<< "$changed"

echo "All changed files are docs-only (docs/**, root *.md, .agents/**, .github/**); skipping Vercel build."
exit 0
