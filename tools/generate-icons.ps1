param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\icons")
)

Add-Type -AssemblyName System.Drawing

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

foreach ($size in @(16, 32, 48, 128)) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $margin = [Math]::Max(1.0, $size * 0.055)
  $backgroundPath = New-RoundedRectanglePath -X $margin -Y $margin -Width ($size - 2 * $margin) -Height ($size - 2 * $margin) -Radius ($size * 0.19)
  $backgroundBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#171714"))
  $graphics.FillPath($backgroundBrush, $backgroundPath)

  $paperBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#F1EAD8"))
  $frameX = $size * 0.19
  $frameY = $size * 0.22
  $frameWidth = $size * 0.62
  $frameHeight = $size * 0.56
  $graphics.FillRectangle($paperBrush, $frameX, $frameY, $frameWidth, $frameHeight)

  $holeBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#171714"))
  $holeSize = [Math]::Max(1.0, $size * 0.075)
  foreach ($column in @(0.25, 0.43, 0.61)) {
    $graphics.FillRectangle($holeBrush, $size * $column, $size * 0.25, $holeSize, $holeSize * 0.72)
    $graphics.FillRectangle($holeBrush, $size * $column, $size * 0.69, $holeSize, $holeSize * 0.72)
  }

  $lineWidth = [Math]::Max(1.1, $size * 0.075)
  $bridgePen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#007722"), $lineWidth)
  $bridgePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $bridgePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($bridgePen, $size * 0.31, $size * 0.57, $size * 0.68, $size * 0.43)

  $nodeSize = [Math]::Max(2.0, $size * 0.13)
  $greenBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#00A13A"))
  $orangeBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#FF8000"))
  $blueBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#40BCF4"))
  $graphics.FillEllipse($greenBrush, $size * 0.25, $size * 0.51, $nodeSize, $nodeSize)
  $graphics.FillEllipse($orangeBrush, $size * 0.62, $size * 0.36, $nodeSize, $nodeSize)
  if ($size -ge 32) {
    $smallNode = $nodeSize * 0.48
    $graphics.FillEllipse($blueBrush, $size * 0.72, $size * 0.49, $smallNode, $smallNode)
  }

  $outputPath = Join-Path $resolvedOutput "icon-$size.png"
  $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $bridgePen.Dispose()
  $greenBrush.Dispose()
  $orangeBrush.Dispose()
  $blueBrush.Dispose()
  $holeBrush.Dispose()
  $paperBrush.Dispose()
  $backgroundBrush.Dispose()
  $backgroundPath.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Output "Generated Chrome extension icons in $resolvedOutput"
