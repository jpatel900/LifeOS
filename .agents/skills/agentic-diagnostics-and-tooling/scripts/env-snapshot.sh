#!/bin/sh
# env-snapshot.sh - dump OS info, tool versions, and key env vars to a file,
# so two machines (or the same machine before/after) can be compared with diff.
# Usage: env-snapshot.sh [OUTFILE]   (default: env-snapshot.txt)
# Dependencies: POSIX sh + coreutils only. Missing tools are skipped, not errors.

OUT="${1:-env-snapshot.txt}"

{
    echo "# env-snapshot $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "## os"
    uname -a 2>/dev/null

    echo "## tool versions"
    for t in git node npm pnpm yarn python python3 pip pip3 java mvn gradle \
             go rustc cargo dotnet docker make cmake bash; do
        if command -v "$t" >/dev/null 2>&1; then
            # first line of version output; java prints -version to stderr
            v=$("$t" --version 2>&1 | head -n 1)
            echo "$t: $v"
        fi
    done

    echo "## key env vars"
    env 2>/dev/null | LC_ALL=C sort | grep -E \
        '^(PATH|HOME|SHELL|LANG|LC_|TZ|TMPDIR|JAVA_HOME|NODE_ENV|NODE_OPTIONS|NPM_CONFIG|PYTHON|VIRTUAL_ENV|CONDA_|GOPATH|GOROOT|CARGO_HOME|RUSTUP_HOME|DOTNET_|HTTP_PROXY|HTTPS_PROXY|NO_PROXY|http_proxy|https_proxy|no_proxy)='
} > "$OUT"

echo "wrote $OUT"
