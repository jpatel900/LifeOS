# git-hotspots.ps1 - print the most-churned files in the current git repo.
# Usage: ./git-hotspots.ps1 [-Top 20] [-Since "90 days ago"]
# Dependencies: git + PowerShell 5.1 or later only.

param(
    [int]$Top = 20,
    [string]$Since = ""
)

git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error "not inside a git repository"
    exit 1
}

$gitArgs = @('log', '--format=', '--name-only')
if ($Since) { $gitArgs += "--since=$Since" }

git @gitArgs |
    Where-Object { $_ -ne '' } |
    Group-Object |
    Sort-Object Count -Descending |
    Select-Object -First $Top |
    ForEach-Object { '{0,6}  {1}' -f $_.Count, $_.Name }
