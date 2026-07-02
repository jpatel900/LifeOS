# repo-recon.ps1 -- Phase-0 repo reconnaissance summary.
# Usage: pwsh -File repo-recon.ps1 [-Repo <path>]   (default: current directory)
# Dependency-free: needs only git and PowerShell 5+. Read-only; makes no changes.

param([string]$Repo = ".")

Set-Location -Path $Repo -ErrorAction Stop

function Section($t) { Write-Output "`n===== $t =====" }

Section "TOP-LEVEL LAYOUT"
Get-ChildItem -Force -Name . | ForEach-Object { "  $_" }

Section "PACKAGE MANIFESTS FOUND"
$manifests = @("package.json","pyproject.toml","setup.py","requirements.txt","Cargo.toml",
  "go.mod","pom.xml","build.gradle","build.gradle.kts","Gemfile","composer.json","Makefile",
  "CMakeLists.txt","mix.exs","Package.swift","Dockerfile","docker-compose.yml","docker-compose.yaml")
$found = @()
foreach ($m in $manifests) { if (Test-Path $m) { $found += $m } }
$found += (Get-ChildItem -Name -Filter *.csproj -ErrorAction SilentlyContinue)
$found += (Get-ChildItem -Name -Filter *.sln  -ErrorAction SilentlyContinue)
if ($found.Count -gt 0) { $found | ForEach-Object { "  $_" } }
else { "  (none at top level -- check subdirectories; may be a monorepo)" }

Section "TEST COMMANDS DETECTED (heuristic)"
if (Test-Path package.json) {
  "  package.json scripts block:"
  try {
    $pkg = Get-Content package.json -Raw | ConvertFrom-Json
    if ($pkg.scripts) { $pkg.scripts.PSObject.Properties | ForEach-Object { "    $($_.Name): $($_.Value)" } }
  } catch { "    (could not parse package.json)" }
}
if (Test-Path pyproject.toml) {
  Select-String -Path pyproject.toml -Pattern '^\[tool\.(pytest|tox|hatch|poe)' |
    ForEach-Object { "  pyproject.toml: $($_.Line)" }
}
if (Test-Path pytest.ini) { "  pytest.ini present -> likely 'pytest'" }
if (Test-Path tox.ini)    { "  tox.ini present -> likely 'tox'" }
if (Test-Path Cargo.toml) { "  Cargo.toml present -> likely 'cargo test'" }
if (Test-Path go.mod)     { "  go.mod present -> likely 'go test ./...'" }
if (Test-Path Makefile) {
  "  Makefile targets containing 'test':"
  Select-String -Path Makefile -Pattern '^[A-Za-z0-9_.-]*test[A-Za-z0-9_.-]*:' |
    ForEach-Object { "    $($_.Line)" }
}
"  (Ground truth is CI config below -- trust it over the above.)"

Section "CI CONFIG FILES"
$ciPaths = @(".github/workflows",".gitlab-ci.yml",".circleci","azure-pipelines.yml",
  "Jenkinsfile",".travis.yml","bitbucket-pipelines.yml",".buildkite",".drone.yml")
$anyCi = $false
foreach ($p in $ciPaths) {
  if (Test-Path $p) {
    $anyCi = $true
    if ((Get-Item $p).PSIsContainer) {
      "  $p/:"
      Get-ChildItem -Name $p | ForEach-Object { "    $_" }
    } else { "  $p" }
  }
}
if (-not $anyCi) { "  (none found)" }

git rev-parse --git-dir *> $null
if ($LASTEXITCODE -eq 0) {
  Section "20 MOST-CHURNED FILES (last 500 commits)"
  git log -500 --format= --name-only |
    Where-Object { $_ -ne "" } |
    Group-Object | Sort-Object Count -Descending | Select-Object -First 20 |
    ForEach-Object { "  {0,5}  {1}" -f $_.Count, $_.Name }

  Section "RECENT REVERTS (last 200 commits)"
  $reverts = git log -200 --oneline --grep=revert -i
  if ($reverts) { $reverts | Select-Object -First 20 } else { "  (none)" }

  Section "LAST 30 COMMITS"
  git log --oneline -30

  Section "UNMERGED BRANCHES (possible dead/abandoned work)"
  git branch -a --no-merged 2>$null | Select-Object -First 20
} else {
  Section "GIT"
  "  Not a git repository -- history sections skipped."
}

Write-Output "`nDone. Read the SKILL.md runbook for how to interpret this."
