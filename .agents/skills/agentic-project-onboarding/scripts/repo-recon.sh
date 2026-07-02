#!/bin/sh
# repo-recon.sh -- Phase-0 repo reconnaissance summary.
# Usage: sh repo-recon.sh [path-to-repo]   (default: current directory)
# Dependency-free: needs only git and POSIX sh/coreutils. Read-only; makes no changes.

REPO="${1:-.}"
cd "$REPO" || { echo "ERROR: cannot cd to $REPO"; exit 1; }

section() { printf '\n===== %s =====\n' "$1"; }

section "TOP-LEVEL LAYOUT"
ls -A .

section "PACKAGE MANIFESTS FOUND"
FOUND=0
for f in package.json pyproject.toml setup.py requirements.txt Cargo.toml go.mod \
         pom.xml build.gradle build.gradle.kts Gemfile composer.json Makefile \
         CMakeLists.txt mix.exs Package.swift *.csproj *.sln Dockerfile \
         docker-compose.yml docker-compose.yaml; do
  # shellcheck disable=SC2043
  for m in $f; do
    [ -e "$m" ] && { echo "  $m"; FOUND=1; }
  done
done
[ "$FOUND" -eq 0 ] && echo "  (none at top level -- check subdirectories; may be a monorepo)"

section "TEST COMMANDS DETECTED (heuristic)"
if [ -f package.json ]; then
  echo "  package.json scripts block:"
  sed -n '/"scripts"[[:space:]]*:/,/}/p' package.json | sed 's/^/    /'
fi
[ -f pyproject.toml ] && grep -n -E '^\[tool\.(pytest|tox|hatch|poe)' pyproject.toml | sed 's/^/  pyproject.toml: /'
[ -f pytest.ini ] && echo "  pytest.ini present -> likely 'pytest'"
[ -f tox.ini ] && echo "  tox.ini present -> likely 'tox'"
[ -f Cargo.toml ] && echo "  Cargo.toml present -> likely 'cargo test'"
[ -f go.mod ] && echo "  go.mod present -> likely 'go test ./...'"
[ -f Makefile ] && { echo "  Makefile targets containing 'test':"; grep -E '^[A-Za-z0-9_.-]*test[A-Za-z0-9_.-]*:' Makefile | sed 's/^/    /'; }
echo "  (Ground truth is CI config below -- trust it over the above.)"

section "CI CONFIG FILES"
CI=0
for p in .github/workflows .gitlab-ci.yml .circleci azure-pipelines.yml Jenkinsfile \
         .travis.yml bitbucket-pipelines.yml .buildkite .drone.yml; do
  if [ -e "$p" ]; then
    CI=1
    if [ -d "$p" ]; then echo "  $p/:"; ls "$p" | sed 's/^/    /'; else echo "  $p"; fi
  fi
done
[ "$CI" -eq 0 ] && echo "  (none found)"

if git rev-parse --git-dir >/dev/null 2>&1; then
  section "20 MOST-CHURNED FILES (last 500 commits)"
  git log -500 --format= --name-only | sed '/^$/d' | sort | uniq -c | sort -rn | head -20

  section "RECENT REVERTS (last 200 commits)"
  REVERTS=$(git log -200 --oneline --grep=revert -i)
  if [ -n "$REVERTS" ]; then echo "$REVERTS" | head -20; else echo "  (none)"; fi

  section "LAST 30 COMMITS"
  git log --oneline -30

  section "UNMERGED BRANCHES (possible dead/abandoned work)"
  git branch -a --no-merged 2>/dev/null | head -20
else
  section "GIT"
  echo "  Not a git repository -- history sections skipped."
fi

printf '\nDone. Read the SKILL.md runbook for how to interpret this.\n'
