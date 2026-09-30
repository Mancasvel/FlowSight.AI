<#
  Stage the x64 Visual C++ runtime beside llama-server.exe. Windows loads these
  app-local DLLs before System32, so a clean machine does not need a separate
  administrator-run redistributable installer. Release CI must source them from
  the Microsoft Visual Studio VC\Redist\MSVC folder.
#>
[CmdletBinding()]
param(
    [string] $SourceDirectory = $env:FLOWSIGHT_VC_REDIST_DIR
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'The Visual C++ runtime is only staged on Windows.' }

$dllNames = @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')
$minimumVersion = [version] '14.40.0.0'
$destination = Join-Path $PSScriptRoot '../local_llm/bin'
$appDestination = Join-Path $PSScriptRoot '../local_llm/app_runtime'

function Get-RuntimeVersion([System.IO.FileInfo] $File) {
    $match = [regex]::Match($File.VersionInfo.FileVersion, '^\d+\.\d+\.\d+\.\d+')
    if (-not $match.Success) { throw "No file version on $($File.FullName)" }
    return [version] $match.Value
}

function Test-RuntimeSource([string] $Directory) {
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) { return $false }
    foreach ($name in $dllNames) {
        $file = Get-Item -LiteralPath (Join-Path $Directory $name) -ErrorAction SilentlyContinue
        if (-not $file -or (Get-RuntimeVersion $file) -lt $minimumVersion) { return $false }
        $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
            return $false
        }
    }
    return $true
}

if (-not $SourceDirectory) {
    $candidates = @()
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if (-not $base) { continue }
        $visualStudio = Join-Path $base 'Microsoft Visual Studio/2022'
        if (-not (Test-Path -LiteralPath $visualStudio)) { continue }
        foreach ($edition in (Get-ChildItem -LiteralPath $visualStudio -Directory)) {
            $redist = Join-Path $edition.FullName 'VC/Redist/MSVC'
            if (-not (Test-Path -LiteralPath $redist)) { continue }
            foreach ($versionDir in (Get-ChildItem -LiteralPath $redist -Directory)) {
                $candidates += Join-Path $versionDir.FullName 'x64/Microsoft.VC143.CRT'
            }
        }
    }
    $SourceDirectory = $candidates |
        Where-Object { Test-RuntimeSource $_ } |
        Sort-Object { Get-RuntimeVersion (Get-Item -LiteralPath (Join-Path $_ 'msvcp140.dll')) } -Descending |
        Select-Object -First 1
}

if (-not $SourceDirectory -or -not (Test-RuntimeSource $SourceDirectory)) {
    throw 'A signed Microsoft Visual C++ 2022 x64 CRT (14.40 or newer) is required. Install the current Visual Studio 2022 C++ redist component or set FLOWSIGHT_VC_REDIST_DIR to its x64 Microsoft.VC143.CRT directory.'
}

New-Item -ItemType Directory -Path $destination -Force | Out-Null
New-Item -ItemType Directory -Path $appDestination -Force | Out-Null
foreach ($name in $dllNames) {
    $source = Join-Path $SourceDirectory $name
    foreach ($directory in @($destination, $appDestination)) {
        $target = Join-Path $directory $name
        $temporary = "$target.staging-$([guid]::NewGuid().ToString('N'))"
        try {
            Copy-Item -LiteralPath $source -Destination $temporary
            if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne
                (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash) {
                throw "Visual C++ runtime copy failed verification: $name"
            }
            Move-Item -LiteralPath $temporary -Destination $target -Force
        } finally {
            if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
        }
    }
}

Write-Host "Staged signed Visual C++ runtime $((Get-RuntimeVersion (Get-Item -LiteralPath (Join-Path $SourceDirectory 'msvcp140.dll'))).ToString()) from $SourceDirectory"
