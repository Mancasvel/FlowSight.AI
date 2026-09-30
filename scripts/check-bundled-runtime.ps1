<# Ensure the generated NSIS installer puts Visual C++ beside both executables. #>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$scriptPath = Join-Path $root 'apps/agent/src-tauri/target/release/nsis/x64/installer.nsi'
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "Generated NSIS script not found: $scriptPath"
}
$installerScript = Get-Content -LiteralPath $scriptPath -Raw
foreach ($name in @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')) {
    $appTarget = "/oname=$name"
    $sidecarTarget = "/oname=local_llm\bin\$name"
    if (-not $installerScript.Contains($appTarget)) {
        throw "NSIS does not install $name next to app.exe."
    }
    if (-not $installerScript.Contains($sidecarTarget)) {
        throw "NSIS does not install $name next to llama-server.exe."
    }
}
Write-Host 'NSIS includes the signed Visual C++ runtime next to app.exe and llama-server.exe.'
