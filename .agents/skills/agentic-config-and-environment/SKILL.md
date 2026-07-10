---
name: agentic-config-and-environment
description: "Use when you need to discover, catalog, or safely change a repo's configuration (env vars, flags, config files, CI variables, secrets), or when setting up / recreating a dev environment from scratch (toolchain versions, package managers, PATH problems). Also when: 'what config does this repo have', 'add a feature flag safely', 'works on my machine but not CI', 'fresh clone won't build', 'wrong node/python version', 'PATH is picking up the wrong binary', Windows-vs-bash command differences."
---

# Config and Environment: Catalog Every Axis, Rebuild From Zero

Two joined disciplines. First: every knob that changes a program's behavior is a "config axis," and undocumented axes are where agents and new engineers silently break things — so you enumerate them all and keep one document of record. Second: an environment you cannot recreate from a fresh clone is a liability — so you pin toolchains, verify binaries before trusting them, and treat the clean-clone test as ground truth. Agents inherit dirty shells and stale PATHs from whoever ran before them; verify-before-trust is not paranoia, it is the baseline.

## When to use / when NOT to use

**Use when:**
- Onboarding to a repo and you need the full config inventory before changing anything.
- Adding, changing, or removing any config axis (env var, flag, config file key).
- Bootstrapping a dev environment on a new machine, container, or CI runner.
- Debugging "works here, fails there" where the suspected cause is environment, not code.

**Do NOT use when:**
- You want to *run, deploy, or operate* the built artifact (start commands, process hygiene, rollback) → **agentic-run-and-operate**.
- You are doing first-contact repo recon (what to read in what order) → **agentic-project-onboarding**. That skill tells you *when* to inventory config; this one tells you *how*.
- The env difference is confirmed and you are now bisecting a bug → **agentic-debugging-playbook**.
- You are deciding whether a config change is safe to ship → gate it via **agentic-change-control**.

---

## Part 1 — Config discovery and cataloging

### 1.1 The axes to enumerate

A "config axis" is any input that changes runtime behavior without a code change. There are six. Enumerate all six for any repo; a catalog missing an axis is worse than none because it implies completeness.

| Axis | What it is |
|---|---|
| Environment variables | Values read from the process env |
| CLI flags / args | Options parsed at startup |
| Config files | Committed or expected-on-disk files (also check README for "create a .env") |
| Feature flags | Runtime toggles, often via a flag service or a flags module |
| CI variables | Env injected by the pipeline, not the repo |
| Secrets locations | Where real credentials live (vault, CI secret store, .env.local) — plus ask a human; secrets stores are often invisible to the repo |

Discovery commands, one per axis (fenced so they copy-paste cleanly; run at repo root):

```sh
git grep -nE 'process\.env|os\.environ|getenv|env::var|ENV\[' -- ':!*.lock'      # env vars
git grep -nE 'argparse|yargs|commander|clap|flag\.'                              # CLI flags; then run the binary with --help
git ls-files | grep -iE '\.(json|ya?ml|toml|ini|env|cfg|conf|properties)$'       # config files
git grep -niE 'feature.?flag|launchdarkly|unleash|flipper|isEnabled\('           # feature flags
git grep -nE 'secrets\.|vars\.|env:' -- .github/workflows                        # CI vars (GitLab: .gitlab-ci.yml)
git grep -niE 'vault|secretsmanager|keyvault|\.env\.local|dotenv'                # secrets locations
```

(PowerShell: the `git` invocations are identical; for the config-files line replace `| grep -iE '...'` with `| Select-String -Pattern '\.(json|ya?ml|toml|ini|env|cfg|conf|properties)$'`.)

Also check for sample files that reveal expected env vars: `git ls-files | grep -iE 'example|sample|template'`.

Hard rule: **the discovery pass is read-only.** Do not "fix" config while inventorying it.

### 1.2 CONFIG.md — the document of record

Keep one file (suggested: `docs/CONFIG.md`, or wherever the repo's docs of record live — see **agentic-docs-and-writing**). One row per axis entry:

```markdown
| Option | Axis | Default | Prod value / Experimental? | Guard | Owner | Last verified | Re-verify with |
|---|---|---|---|---|---|---|---|
| MAX_RETRIES | env var | 3 | prod: 5 | clamped 0-10 in config.ts | @<owner> | 2026-07-02 | `git grep -n MAX_RETRIES` |
| --dry-run | CLI flag | off | experimental | no-op unless set | @<owner> | 2026-07-02 | `<binary> --help \| grep dry-run` |
```

Column semantics:
- **Default**: what happens when the option is absent. If you cannot state this, you do not understand the option — go read the code.
- **Prod value / Experimental?**: distinguishes load-bearing production config from experiments awaiting removal. Every "experimental" row must have a removal plan (issue link or date).
- **Guard**: what prevents a bad value (validation, clamp, startup assertion). "None" is an honest and alarming entry.
- **Last verified + Re-verify with**: flags drift. Every entry carries a one-line command that confirms the entry is still true. A row nobody can re-verify in one command is a row nobody will maintain. Stale `Last verified` dates (default heuristic: >90 days) mean re-run the command before trusting the row.

### 1.3 Checklist: ADDING a config axis safely

Work through in order; every item is a hard rule unless marked default.

- [ ] **Default preserves old behavior.** Absent/unset must equal pre-change behavior. If the new default intentionally changes behavior, that is a behavior change wearing a config costume — route it through **agentic-change-control**.
- [ ] **Documented in the same PR.** The CONFIG.md row lands in the same commit/PR as the code. "I'll document it later" is how catalogs die.
- [ ] **Test both states.** One test with the option unset (old behavior), one with it set (new behavior). A flag with only the happy-path state tested is untested.
- [ ] **Guard invalid values.** Fail loudly at startup on out-of-range/unparseable values; never silently fall back mid-request.
- [ ] **Removal plan for experiments.** If the axis exists to test a hypothesis, write down when/how it dies (date or linked issue) before it merges. (Default practice: experiments older than one quarter get an explicit keep-or-kill decision.)
- [ ] **Name it greppably.** `ENABLE_BATCH_V2` is findable; a key called `mode` inside a nested YAML block is not. Prefer one unique token.

### 1.4 Drift control

Config catalogs rot in weeks, not years. Two cheap defenses:

1. Every row's `Re-verify with` command, runnable by an agent with no context.
2. A periodic sweep: re-run the axis discovery commands from 1.1 and diff the hits against CONFIG.md rows. New hits with no row = undocumented axis; rows with no hits = dead config to delete. (Candidate practice: automate this as a CI job that fails on mismatch — valuable but requires disciplined naming from 1.3.)

---

## Part 2 — Environment bootstrap from scratch

### 2.1 Toolchain pinning

Principle: **the repo, not the machine, declares its toolchain. Commit the pin.**

| Ecosystem | Pin mechanism (commit these) | Check what's expected |
|---|---|---|
| Node | `.nvmrc` or `.node-version`; `"engines"` and `"packageManager"` in `package.json`; lockfile (`package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`) | `cat .nvmrc; git grep -n '"engines"\|"packageManager"' package.json` |
| Python | `.python-version`; `pyproject.toml` `requires-python`; lockfile (`poetry.lock` / `uv.lock` / pinned `requirements.txt`) | `cat .python-version; git grep -n requires-python pyproject.toml` |
| Multi-tool | `.tool-versions` (asdf/mise) | `cat .tool-versions` |
| Rust | `rust-toolchain.toml`; `Cargo.lock` | `cat rust-toolchain.toml` |
| Go | `go` directive in `go.mod`; `go.sum` | `head -5 go.mod` |
| JVM | `.sdkmanrc`; Gradle wrapper (`gradlew` + `gradle/wrapper/`) — use the wrapper, never a global gradle | `cat .sdkmanrc 2>/dev/null; ls gradlew` |

Activation, once pins exist: `nvm use` / `nvm install` (reads `.nvmrc`); `corepack enable` then normal `pnpm`/`yarn` commands (respects `packageManager`); `asdf install` or `mise install` (reads `.tool-versions`); `pyenv install` (reads `.python-version`).

Hard rule: if you (the agent) choose a toolchain version because no pin exists, **add the pin file in your PR** and note it — do not leave the choice implicit in your session.

### 2.2 Verify before trust

Agents inherit dirty PATHs: previous sessions, global installs, OS-bundled interpreters. Before using any binary, confirm *which* binary and *which* version. Cost: seconds. Cost of skipping: a session debugging the wrong interpreter.

```bash
# bash                            # PowerShell
command -v node                   (Get-Command node).Source
node --version                    node --version
command -v python                 (Get-Command python).Source
python --version                  python --version
python -c "import sys; print(sys.executable)"   # same on both — prints the REAL interpreter path
```

Compare the reported version against the repo's pin. Mismatch = stop and fix the environment before touching code. If a virtualenv should be active, `sys.executable` must point inside it (`.venv/...`), not at a system Python.

### 2.3 The clean-clone test — gold standard

Hard rule: **if a fresh clone cannot build with the documented steps, the docs are wrong** — not the machine, not the newcomer, not the agent. This is the only honest test of "the environment is reproducible."

```bash
# bash — never test in your working copy; clone into scratch space
git clone <repo-url> /tmp/clean-clone-test && cd /tmp/clean-clone-test
# then follow README/CONFIG.md steps EXACTLY as written, no improvisation
```

```powershell
# PowerShell
git clone <repo-url> "$env:TEMP\clean-clone-test"; Set-Location "$env:TEMP\clean-clone-test"
```

Rules of the test: follow only written steps; every deviation you were forced to make is a docs bug — fix the docs in the same session. Cheaper approximation when a full clone is too slow: `git stash -u` in the working copy proves much less (your global tools and caches still leak in) — treat it as a smoke test only. Fresh-clone reproducibility of *claims* (demos, benchmarks) is owned by **agentic-external-positioning**; this section owns build reproducibility.

### 2.4 Known traps: symptom → cause → check

| Symptom | Likely trap | Discriminating check |
|---|---|---|
| Right version yesterday, wrong today; or `--version` disagrees with expectations | **PATH shadowing** — two installs, wrong one first on PATH | bash: `type -a node`; PowerShell: `Get-Command node -All \| Select-Object Source` — more than one hit = shadowing |
| Script fails on Windows with quoting/parse errors but works in CI | **PowerShell-vs-bash syntax** — `&&`, quoting, `$VAR` vs `$env:VAR` differ (see 2.5) | Identify the actual shell: `echo $0` (bash) / `$PSVersionTable.PSEdition` (pwsh) |
| Git shows every line of a file as modified; diffs are whole-file | **Line endings / autocrlf** — CRLF vs LF churn | `git config core.autocrlf` and `git ls-files --eol <file>`; fix repo-side with a committed `.gitattributes` (`* text=auto`), not per-machine config |
| Tool works in your terminal but "command not found" in CI or a fresh shell | **Global-vs-local install** — you installed it globally once and forgot | `npm ls <pkg>` (local) vs `npm ls -g --depth=0` (global); `pip show <pkg>` and check `Location:`. Fix: add it to project dependencies; invoke via `npx <tool>` / lockfile scripts, not the global |
| Passes locally, fails in CI (or vice versa) with no code diff | **CI-vs-local parity gap** — different OS, env vars, or tool versions | Print both environments and diff: run `env \| sort` (bash) / `Get-ChildItem Env: \| Sort-Object Name` (PowerShell) locally, add the same as a CI step, compare. Also diff tool versions: `node --version`, `python --version` in both |
| Build reads config you never set | **Inherited env from parent shell/session** — a var exported hours ago | bash: `printenv <VAR>`; PowerShell: `$env:<VAR>`. Reproduce in a clean shell: `env -i bash -lc '<cmd>'` (bash; `-i` strips the environment) |
| Path with spaces or backslashes breaks a script | **Path separator / quoting** — `\` is an escape char in bash, a separator in Windows | Prefer forward slashes everywhere (Windows APIs and git accept them); always quote paths |

### 2.5 Cross-platform command table

Verified operational differences for the shells an agent actually meets. When writing repo scripts, prefer a task runner or Node/Python scripts over raw shell to avoid this table entirely (default practice).

| Operation | bash | PowerShell |
|---|---|---|
| Read env var | `echo "$FOO"` | `$env:FOO` |
| Set env var (session) | `export FOO=bar` | `$env:FOO = 'bar'` |
| Set var for one command | `FOO=bar cmd` | not supported inline — `$env:FOO='bar'; cmd` |
| List all env vars | `env \| sort` | `Get-ChildItem Env: \| Sort-Object Name` |
| Which binary | `command -v x` or `type -a x` | `(Get-Command x).Source` / `-All` for shadow check |
| Discard output | `>/dev/null 2>&1` | `*> $null` |
| Temp dir | `/tmp` or `$TMPDIR` | `$env:TEMP` |
| Home dir | `$HOME` / `~` | `$env:USERPROFILE` / `$HOME` (pwsh) |
| Chain on success | `a && b` | `a && b` (pwsh 7+); `a; if ($?) { b }` (Windows PowerShell 5.1) |
| Line continuation | `\` at end of line | backtick `` ` `` at end of line |
| String with literal `$` | single quotes `'$x'` | single quotes `'$x'` (same rule, happily) |
| Recursive delete | `rm -rf dir` | `Remove-Item -Recurse -Force dir` |
| Make dir incl. parents | `mkdir -p a/b` | `New-Item -ItemType Directory -Force a/b` |

Trap inside the trap: on Windows, `python`, `node`, `git` etc. are the same executables from either shell — only the *shell syntax around them* differs. If a command fails, first determine whether the failure is the tool or the shell wrapping.

---

## Provenance and maintenance

- Authored 2026-07-02 as part of the general agentic-engineering skill library. All commands smoke-tested or standard-tool-verified as of that date.
- **Volatile facts** and their re-verification one-liners:
  - Corepack ships with Node but is not enabled by default (as of 2026-07-02; Node has discussed unbundling it) — verify: `corepack --version`.
  - `&&` in PowerShell requires pwsh 7+ — verify: `$PSVersionTable.PSVersion`.
  - Pin-file conventions (`.nvmrc`, `.tool-versions`, `packageManager`) are ecosystem norms, not standards; `mise` is increasingly replacing `asdf` (as of 2026-07-02) — verify per-repo with the "Check what's expected" column in 2.1.
  - The discovery greps in 1.1 use `git grep`, available wherever git is; if the repo is huge, `rg` (ripgrep) is faster but not guaranteed installed — verify: `rg --version`.
- **Stable facts**: the six config axes, the clean-clone rule, verify-before-trust, and the add-an-axis checklist are method, not tooling — expected to outlive any command above.
