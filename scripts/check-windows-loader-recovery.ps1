<#
  Start a copy of app.exe with corrupt app-local VC runtime DLLs. If the
  executable imports any of them before main(), the Windows loader exits before
  FlowSight can check its installation or offer the signed repair flow.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $Executable,
    [string] $ScratchDirectory = $env:RUNNER_TEMP
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'The loader recovery check requires Windows.' }
if (-not $ScratchDirectory) { $ScratchDirectory = [System.IO.Path]::GetTempPath() }
$source = (Resolve-Path -LiteralPath $Executable).Path
$fixture = Join-Path $ScratchDirectory ('flowsight-loader-probe-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
$copy = Join-Path $fixture 'app.exe'
Copy-Item -LiteralPath $source -Destination $copy
foreach ($name in @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')) {
    [System.IO.File]::WriteAllBytes((Join-Path $fixture $name), [byte[]]@())
}

Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class FlowSightLoaderErrorMode {
    [DllImport("kernel32.dll")] public static extern uint GetErrorMode();
    [DllImport("kernel32.dll")] public static extern uint SetErrorMode(uint mode);
}
'@

$previousMode = [FlowSightLoaderErrorMode]::GetErrorMode()
try {
    # Suppress the loader's native error dialog if this check regresses.
    [void][FlowSightLoaderErrorMode]::SetErrorMode($previousMode -bor 0x0001 -bor 0x0002)
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $copy
    $start.Arguments = '--mcp'
    $start.WorkingDirectory = $fixture
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true

    $process = [System.Diagnostics.Process]::Start($start)
    try {
        $process.StandardInput.Close() # MCP exits without touching user data on EOF.
        if (-not $process.WaitForExit(10000)) {
            $process.Kill()
            throw 'FlowSight did not exit after the MCP stdin stream closed.'
        }
        if ($process.ExitCode -ne 0) {
            throw "FlowSight could not start with corrupt app-local VC DLLs (exit $($process.ExitCode))."
        }
    } finally {
        $process.Dispose()
    }
} finally {
    [void][FlowSightLoaderErrorMode]::SetErrorMode($previousMode)
}
Write-Host 'FlowSight reached main() with corrupt app-local VC DLLs; GUI installation repair can run.'
