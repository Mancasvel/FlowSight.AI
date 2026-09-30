[CmdletBinding()]
param([string]$OutputPath)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$source = Join-Path $repo 'apps\agent\browser-extension'
$names = @('manifest.json', 'worker.js', 'options.html', 'options.js', 'icon16.png', 'icon48.png', 'icon128.png')
$files = foreach ($name in $names) {
    $path = Join-Path $source $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing browser extension file: $path"
    }
    $path
}

$manifest = Get-Content -LiteralPath (Join-Path $source 'manifest.json') -Raw | ConvertFrom-Json
if (-not $OutputPath) {
    $OutputPath = Join-Path $repo "dist\FlowSight-Browser-Controls-v$($manifest.version).zip"
}
$target = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $target) {
    throw "Package already exists; choose a new output path: $target"
}
$directory = Split-Path -Parent $target
New-Item -ItemType Directory -Path $directory -Force | Out-Null
Compress-Archive -LiteralPath $files -DestinationPath $target -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($target)
try {
    $actual = @($archive.Entries | ForEach-Object FullName | Sort-Object)
    $expected = @($names | Sort-Object)
    if (($actual -join '|') -ne ($expected -join '|')) {
        throw "Unexpected ZIP entries: $($actual -join ', ')"
    }
} finally {
    $archive.Dispose()
}
Write-Output $target
