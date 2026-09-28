param()

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$metadata = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.version -ne $metadata.version) { throw "Manifest and package versions differ." }

$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "dist"))
[System.IO.Directory]::CreateDirectory($outputRoot) | Out-Null
$zipPath = Join-Path $outputRoot ("film-bridge-v{0}.zip" -f $manifest.version)
if (Test-Path -LiteralPath $zipPath) { throw "Package already exists: $zipPath. Rename it before rebuilding." }

$stagePath = [System.IO.Path]::GetFullPath((Join-Path $outputRoot (".stage-" + [guid]::NewGuid().ToString("N"))))
# Validate the final cleanup target before creating or recursively removing it.
if (-not $stagePath.StartsWith($outputRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Invalid staging path."
}
New-Item -ItemType Directory -Path $stagePath | Out-Null
try {
  New-Item -ItemType Directory -Path (Join-Path $stagePath "src"), (Join-Path $stagePath "icons") | Out-Null
  foreach ($name in @("manifest.json", "README.md", "PRIVACY.md", "LICENSE", "CHANGELOG.md")) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination (Join-Path $stagePath $name)
  }
  foreach ($file in Get-ChildItem -LiteralPath (Join-Path $projectRoot "src") -File) {
    if ($file.Extension -in @(".js", ".css", ".html", ".svg")) {
      Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $stagePath "src")
    }
  }
  foreach ($size in @(16, 32, 48, 128)) {
    $name = "icon-$size.png"
    Copy-Item -LiteralPath (Join-Path $projectRoot "icons\$name") -Destination (Join-Path $stagePath "icons\$name")
  }
  [System.IO.Compression.ZipFile]::CreateFromDirectory($stagePath, $zipPath)
  $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $names = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    if ("manifest.json" -notin $names) { throw "Manifest is not at the archive root." }
    foreach ($script in $manifest.content_scripts[0].js) {
      if ($script -notin $names) { throw "Missing content script: $script" }
    }
    if ($manifest.background.service_worker -notin $names) { throw "Missing service worker." }
    if ($manifest.options_ui.page -notin $names) { throw "Missing options page." }
    if ($names | Where-Object { $_ -match '(^|/)(\.git|\.env|node_modules|tests|tools)(/|$)' }) {
      throw "Unexpected development or private files in the package."
    }
  } finally { $archive.Dispose() }
  Get-Item -LiteralPath $zipPath | Select-Object FullName, Length
  Get-FileHash -LiteralPath $zipPath -Algorithm SHA256
} finally {
  # Only the explicitly validated, randomly named staging folder is removed.
  Remove-Item -LiteralPath $stagePath -Recurse -Force
}
