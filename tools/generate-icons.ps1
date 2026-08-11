param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\icons"),
  [string]$SourceImage = (Join-Path $PSScriptRoot "..\icons\icon-master.png")
)

Add-Type -AssemblyName System.Drawing

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
$resolvedSource = [System.IO.Path]::GetFullPath($SourceImage)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null

if (-not [System.IO.File]::Exists($resolvedSource)) {
  throw "Icon source not found: $resolvedSource"
}

$sourceFile = [System.Drawing.Image]::FromFile($resolvedSource)
$master = [System.Drawing.Bitmap]::new($sourceFile)
$sourceFile.Dispose()

try {
  foreach ($size in @(16, 32, 48, 128)) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($master, 0, 0, $size, $size)

    $outputPath = Join-Path $resolvedOutput "icon-$size.png"
    $temporaryPath = Join-Path $resolvedOutput "icon-$size.generated.png"
    $bitmap.Save($temporaryPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    Move-Item -LiteralPath $temporaryPath -Destination $outputPath -Force
  }
}
finally {
  $master.Dispose()
}

Write-Output "Generated Film Bridge icons from $resolvedSource"
