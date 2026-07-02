# env-snapshot.ps1 - dump OS info, tool versions, and key env vars to a file,
# so two machines (or the same machine before/after) can be compared with diff
# or Compare-Object.
# Usage: ./env-snapshot.ps1 [-OutFile env-snapshot.txt]
# Dependencies: PowerShell 5.1 or later only. Missing tools are skipped.

param(
    [string]$OutFile = "env-snapshot.txt"
)

$lines = @()
$lines += "# env-snapshot $([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))"
$lines += "## os"
$lines += [System.Environment]::OSVersion.VersionString
$lines += "## tool versions"

foreach ($t in @('git','node','npm','pnpm','yarn','python','py','pip','java',
                 'mvn','gradle','go','rustc','cargo','dotnet','docker','make',
                 'cmake','pwsh','powershell')) {
    if (Get-Command $t -ErrorAction SilentlyContinue) {
        $v = (& $t --version 2>&1 | Select-Object -First 1)
        $lines += "${t}: $v"
    }
}

$lines += "## key env vars"
$names = @('PATH','HOME','USERPROFILE','TEMP','TMP','LANG','TZ',
           'JAVA_HOME','NODE_ENV','NODE_OPTIONS','VIRTUAL_ENV','CONDA_PREFIX',
           'GOPATH','GOROOT','CARGO_HOME','RUSTUP_HOME','DOTNET_ROOT',
           'HTTP_PROXY','HTTPS_PROXY','NO_PROXY') | Sort-Object
foreach ($n in $names) {
    $val = [System.Environment]::GetEnvironmentVariable($n)
    if ($null -ne $val) { $lines += "$n=$val" }
}

$lines | Set-Content -Path $OutFile -Encoding UTF8
Write-Output "wrote $OutFile"
