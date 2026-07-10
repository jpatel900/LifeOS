---
name: agentic-run-and-operate
description: "Use when running, serving, deploying, or operating software: 'start the dev server', 'run the build', 'deploy this', 'the port is already in use', 'what process is that', 'where did the output go', long-running processes, artifact/log conventions, rollback planning, or handing a running system to the next session. Also use before killing any process or re-running anything that writes."
---

# Agentic Run and Operate

Operating discipline for agents that run things. The characteristic agent failures here are: starting a server in the foreground and wedging the session; killing a process it didn't start; re-running a writing command twice and corrupting state; deploying with no written rollback; and leaving orphan processes for the next session to trip over. Every rule below exists to prevent one of those.

**Jargon:** *artifact* = any file produced by running (builds, logs, generated data). *Orphan* = a process left running after the session that started it ended. *Idempotent* = safe to run twice; the second run changes nothing.

## When to use / when NOT to use

**Use when:**
- Running any project command whose behavior you haven't confirmed (first §1).
- Starting/stopping servers, watchers, or anything long-running.
- Deploying, or preparing to.
- Cleaning up processes, ports, or artifacts.

**Do NOT use for:**
- Whether a deploy/destructive action is *permitted* and who approves it → `agentic-change-control` (deploys are gated there; this skill is the mechanics).
- Toolchain/env setup and "wrong version" problems → `agentic-config-and-environment`.
- Diagnosing why the run fails → `agentic-debugging-playbook`.

## 1. Command anatomy (before running anything unfamiliar)

Answer four questions from evidence — the script/source, `--help`, or the CI config (ground truth, per `agentic-project-onboarding`):

1. **Inputs** — what does it read (args, env vars, config files, network)?
2. **Side effects** — what does it write, delete, send, or start? Anything outside the repo?
3. **Output location** — where do results and logs land?
4. **Stop procedure** — how do you stop it cleanly, and is stopping safe mid-run?

If (2) includes anything external or destructive, stop and classify the door first (`agentic-change-control` §1). If you can't answer (2) at all, run it first in a scratch copy, never in the real tree.

**Idempotence check (hard rule):** before RE-running anything that writes — migrations, seeders, generators, "setup" scripts — determine whether the second run is safe. Discriminators: does it use CREATE-if-not-exists / upsert semantics? Does its doc say idempotent? If unknown, snapshot first (`git status --short` clean? DB dump? copy the target dir), then re-run and diff.

## 2. Long-running processes

**Hard rule: never block a session on a foreground server.** Run it in the background with logs captured to a file, then poll the log:

```sh
# bash
nohup <server-cmd> > server.log 2>&1 &
echo $! > server.pid                      # record the PID you own
sleep 2 && tail -20 server.log            # confirm it actually started
```

```powershell
# PowerShell
$p = Start-Process <exe> -ArgumentList '<args>' -RedirectStandardOutput server.log -RedirectStandardError server.err -PassThru
$p.Id | Set-Content server.pid
Start-Sleep 2; Get-Content server.log -Tail 20
```

(If your agent tool has a native background-process facility, prefer it — it tracks the process for you. The above is the portable fallback.)

**Readiness is verified, not assumed:** a started process is not a ready process. Poll the health endpoint or the log's "listening on" line before using it; `curl -s http://localhost:<port>/health` or equivalent.

**Port hygiene:**

```sh
# Who owns the port? (run BEFORE binding and BEFORE killing)
lsof -i :3000 -sTCP:LISTEN 2>/dev/null || ss -ltnp 2>/dev/null | grep :3000   # Linux/macOS
```
```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }
```

**Hard rule: kill only processes you started** (your recorded PIDs) or that you have positively identified as an orphan of your own project (command line matches, working dir matches). "Something is on port 3000, kill it" has killed other people's databases. Prefer the process's own stop command; escalate `kill <pid>` → `kill -9` (PowerShell: `Stop-Process -Id <pid>`) only if graceful fails. When in doubt about a process you didn't start: use a different port and report the squatter.

## 3. Artifact conventions

- **Discover where things land** before running: build output dirs (`dist/`, `build/`, `target/`, `out/`), log locations, generated-data dirs. Sources: CI config's artifact/upload steps, `.gitignore` (ignored dirs are usually artifact dirs), the build config itself.
- **Generated outputs are never hand-edited** (owned by `agentic-change-control`; find the generator instead).
- **Scratch goes in scratch:** temp experiments, downloaded samples, one-off outputs go in your session's designated scratch/temp area — never the repo root. A repo root polluted with `test2.py`, `output_final.json`, `foo.log` is how the next session mistakes debris for source.
- **Logs from your runs are evidence** — keep them for the duration of the investigation (capture to files per §2, reference them in the verification report per `agentic-validation-and-qa`), then clean up.
- If the project has no documented artifact conventions, that's a doc gap: record what you observed and route it per `agentic-docs-and-writing`.

## 4. Deploy discipline

Deploy *permission* is a change-control question (rung 1–2 of the ladder — human-gated; see `agentic-change-control`). Deploy *mechanics*, once authorized:

**Pre-deploy checklist (hard rule — all boxes, every time):**
- [ ] CI green on the exact commit being deployed (not "the branch, roughly").
- [ ] Migrations: known, ordered, tested against a prod-like copy; reversible or explicitly flagged one-way.
- [ ] Feature-flag state at deploy time is written down (which flags, which values).
- [ ] **Rollback plan is WRITTEN BEFORE deploying**, including the trigger: "if <specific metric/error> exceeds <threshold> within <window>, roll back via <exact command/procedure>." Debugging forward in prod because no rollback was written is the archetypal self-inflicted incident.
- [ ] Post-deploy verification steps listed (what you will check, expected values).

**Defaults:** prefer staged rollout (canary/percentage) where the platform offers it; deploy early in your working window, never as the last act of a session (nobody is watching after); one change per deploy where feasible — batched deploys make rollback a negotiation.

**Post-deploy verification is part of the deploy, not optional:** run the listed checks, paste outcomes into the deploy record/PR. Silent-success deploys train everyone to stop looking.

## 5. Session handoff of a running system

Before ending any session that leaves things running, write (in the task notes, PR, or campaign doc):

```markdown
## Running state handoff (<date>)
- Process: <what> — PID <n> / container <id>, started by me, logs at <path>
- Stop: <exact command>   Safe to kill: <yes/no + why>
- Ports in use: <list>
- Temp/scratch artifacts worth keeping: <paths + why>   Safe to delete: <paths>
- NOT mine (observed, untouched): <anything you noticed but do not own>
```

The next session (or human) must be able to tear everything down from this note alone. Anything not in the note is an orphan you created.

## Provenance and maintenance

Authored 2026-07-02. Rules labeled per house convention: **hard rule** (violation is an incident), **default** (deviate with stated reason). The port/process commands were chosen for portability across Linux/macOS (`lsof`/`ss`) and Windows PowerShell (`Get-NetTCPConnection`); `lsof` is absent on some minimal Linux images — `ss` is the fallback shown.

**Volatile facts, re-verify if this file is old:**
- `lsof`/`ss`/`Get-NetTCPConnection` flag shapes: `lsof -h`, `ss -h`, `Get-Help Get-NetTCPConnection`.
- `Start-Process` redirect parameter names: `Get-Help Start-Process -Parameter *`.
- Agent tools' native background-process facilities change fast — re-check your tool's docs before preferring the portable fallback.
- Sibling skills referenced: `agentic-change-control`, `agentic-config-and-environment`, `agentic-debugging-playbook`, `agentic-project-onboarding`, `agentic-validation-and-qa`, `agentic-docs-and-writing` — re-verify against the library index.
