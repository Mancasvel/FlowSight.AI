<#
  Stage the x64 Visual C++ runtime beside both executables. Windows loads
  app-local DLLs before System32, so a clean machine does not need an
  administrator-run redistributable installer. Only use the distributable
  Microsoft Visual Studio VC\Redist\MSVC\...\x64\Microsoft.VC*.CRT folder.
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

function Get-PeMachine([string] $Path) {
    $reader = [System.IO.BinaryReader]::new([System.IO.File]::OpenRead($Path))
    try {
        if ($reader.ReadUInt16() -ne 0x5a4d) { return 0 }
        $reader.BaseStream.Position = 0x3c
        $peOffset = $reader.ReadInt32()
        if ($peOffset -lt 0x40 -or $peOffset -gt ($reader.BaseStream.Length - 6)) { return 0 }
        $reader.BaseStream.Position = $peOffset
        if ($reader.ReadUInt32() -ne 0x00004550) { return 0 }
        return $reader.ReadUInt16()
    } finally {
        $reader.Dispose()
    }
}

function Test-RuntimeSource([string] $Directory) {
    if ([string]::IsNullOrWhiteSpace($Directory)) {
        return [pscustomobject]@{ Valid = $false; Reason = 'no candidate CRT directory found'; Version = $null }
    }
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        return [pscustomobject]@{ Valid = $false; Reason = 'directory missing'; Version = $null }
    }
    $resolved = (Resolve-Path -LiteralPath $Directory).Path.TrimEnd('\', '/')
    if ($resolved -notmatch '[\\/]VC[\\/]Redist[\\/]MSVC[\\/][^\\/]+[\\/]x64[\\/]Microsoft\.VC\d+\.CRT$') {
        return [pscustomobject]@{ Valid = $false; Reason = 'not an x64 Visual Studio VC/Redist/MSVC CRT directory'; Version = $null }
    }
    $runtimeVersion = $null
    foreach ($name in $dllNames) {
        $file = Get-Item -LiteralPath (Join-Path $resolved $name) -ErrorAction SilentlyContinue
        if (-not $file) {
            return [pscustomobject]@{ Valid = $false; Reason = "$name missing"; Version = $null }
        }
        try {
            $version = Get-RuntimeVersion $file
            if ((Get-PeMachine $file.FullName) -ne 0x8664) {
                return [pscustomobject]@{ Valid = $false; Reason = "$name is not an x64 PE file"; Version = $null }
            }
        } catch {
            return [pscustomobject]@{ Valid = $false; Reason = "$name could not be read as a versioned x64 PE file"; Version = $null }
        }
        if ($version -lt $minimumVersion) {
            return [pscustomobject]@{ Valid = $false; Reason = "$name version $version is older than $minimumVersion"; Version = $null }
        }
        $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
        if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or
            $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
            return [pscustomobject]@{ Valid = $false; Reason = "$name has no valid Microsoft signature ($($signature.Status))"; Version = $null }
        }
        if ($name -eq 'msvcp140.dll') { $runtimeVersion = $version }
    }
    return [pscustomobject]@{ Valid = $true; Reason = 'valid'; Version = $runtimeVersion }
}

if (-not $SourceDirectory) {
    # VS 2026 lives under ...\Microsoft Visual Studio\18\Enterprise, while
    # VS 2022 uses ...\2022\Enterprise. Ask vswhere first and fall back to a
    # shallow search when the Visual Studio installer is unavailable.
    $installations = @()
    $vswherePaths = @()
    foreach ($base in @(${env:ProgramFiles(x86)}, $env:ProgramFiles)) {
        if ($base) { $vswherePaths += Join-Path $base 'Microsoft Visual Studio/Installer/vswhere.exe' }
    }
    foreach ($vswhere in $vswherePaths) {
        if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { continue }
        $found = @(& $vswhere -all -products '*' -property installationPath)
        if ($LASTEXITCODE -eq 0) { $installations += $found }
        else { Write-Warning "vswhere failed at $vswhere (exit $LASTEXITCODE); checking common paths" }
    }
    if ($env:VSINSTALLDIR) { $installations += $env:VSINSTALLDIR }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if (-not $base) { continue }
        $visualStudio = Join-Path $base 'Microsoft Visual Studio'
        if (-not (Test-Path -LiteralPath $visualStudio -PathType Container)) { continue }
        foreach ($versionDir in (Get-ChildItem -LiteralPath $visualStudio -Directory | Where-Object { $_.Name -match '^\d{2,4}$' })) {
            foreach ($edition in (Get-ChildItem -LiteralPath $versionDir.FullName -Directory)) {
                $installations += $edition.FullName
            }
        }
    }
    $validSources = @()
    $installations = @($installations | Where-Object { $_ } | Sort-Object -Unique)
    Write-Host "Visual Studio installations considered: $($installations -join '; ')"
    foreach ($installation in $installations) {
        $redist = Join-Path $installation 'VC/Redist/MSVC'
        if (-not (Test-Path -LiteralPath $redist -PathType Container)) {
            Write-Host "No VC/Redist/MSVC in $installation"
            continue
        }
        foreach ($versionDir in (Get-ChildItem -LiteralPath $redist -Directory)) {
            $x64 = Join-Path $versionDir.FullName 'x64'
            if (-not (Test-Path -LiteralPath $x64 -PathType Container)) { continue }
            foreach ($crt in (Get-ChildItem -LiteralPath $x64 -Directory -Filter 'Microsoft.VC*.CRT')) {
                $result = Test-RuntimeSource $crt.FullName
                if ($result.Valid) {
                    $validSources += [pscustomobject]@{ Path = $crt.FullName; Version = $result.Version }
                } else {
                    Write-Host "Rejected CRT $($crt.FullName): $($result.Reason)"
                }
            }
        }
    }
    $selected = $validSources | Sort-Object Version -Descending | Select-Object -First 1
    if ($selected) { $SourceDirectory = $selected.Path }
}

$validation = Test-RuntimeSource $SourceDirectory
if (-not $validation.Valid) {
    throw "A signed Microsoft Visual C++ x64 CRT (14.40 or newer) is required from Visual Studio VC/Redist/MSVC. Source '$SourceDirectory' was rejected: $($validation.Reason). Install the C++ redistributable component or set FLOWSIGHT_VC_REDIST_DIR to its x64 Microsoft.VC*.CRT directory."
}

Write-Host "Selected Microsoft redistributable CRT $($validation.Version): $SourceDirectory"
foreach ($name in $dllNames) {
    $file = Join-Path $SourceDirectory $name
    Write-Host "  $name SHA-256 $((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash)"
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

Write-Host 'Staged the signed Microsoft Visual C++ x64 runtime beside app.exe and llama-server.exe.'
