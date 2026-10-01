<# Regression: staging must work even when Get-FileHash is unavailable. #>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
function Get-FileHash { throw 'Staging must not depend on the Get-FileHash module function.' }
. (Join-Path $PSScriptRoot 'stage-msvc-runtime.ps1')

# Compare .NET hashes with the independently calculated Utility hashes. Invoke
# the module-qualified command so the blocked unqualified function stays active.
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')
foreach ($name in @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')) {
    $appCopy = Join-Path $PSScriptRoot "../local_llm/app_runtime/$name"
    $sidecarCopy = Join-Path $PSScriptRoot "../local_llm/bin/$name"
    $expected = (Microsoft.PowerShell.Utility\Get-FileHash -LiteralPath $appCopy -Algorithm SHA256).Hash
    if ((Get-RuntimeSha256 $appCopy) -ne $expected -or
        (Get-RuntimeSha256 $sidecarCopy) -ne $expected) {
        throw "SHA-256 regression failed for $name."
    }
}
Write-Host 'Staging and SHA-256 verification work without the unqualified Get-FileHash function.'
