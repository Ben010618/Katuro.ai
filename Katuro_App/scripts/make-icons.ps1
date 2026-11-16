# make-icons.ps1 - the KaTuro App's launcher icons and launch screen, from the KaTuro logo.
# Run from Katuro_App:  powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1
# Source: ..\public\favicon.png (512x512, transparent). White background, the logo centred.
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$res = Join-Path $root 'android\app\src\main\res'
$logo = [System.Drawing.Image]::FromFile((Resolve-Path (Join-Path $root '..\public\favicon.png')))

function Save-Icon([int]$size, [double]$logoShare, [string]$path, [bool]$round, [bool]$transparent) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'HighQuality'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  if (-not $transparent) {
    $white = [System.Drawing.Brushes]::White
    if ($round) { $g.FillEllipse($white, 0, 0, $size, $size) } else { $g.FillRectangle($white, 0, 0, $size, $size) }
  }
  $w = [int]($size * $logoShare)
  $o = [int](($size - $w) / 2)
  $g.DrawImage($logo, $o, $o, $w, $w)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# Legacy and round icons (48dp) and the adaptive foreground (108dp; the logo inside the 66dp safe zone).
$densities = @{ 'mdpi' = 1.0; 'hdpi' = 1.5; 'xhdpi' = 2.0; 'xxhdpi' = 3.0; 'xxxhdpi' = 4.0 }
foreach ($d in $densities.Keys) {
  $dir = Join-Path $res "mipmap-$d"
  $s = $densities[$d]
  Save-Icon ([int](48 * $s)) 0.78 (Join-Path $dir 'ic_launcher.png') $false $false
  Save-Icon ([int](48 * $s)) 0.70 (Join-Path $dir 'ic_launcher_round.png') $true $false
  Save-Icon ([int](108 * $s)) 0.56 (Join-Path $dir 'ic_launcher_foreground.png') $false $true
}

# Launch screens: each existing splash.png keeps its size; white with the logo in the middle.
Get-ChildItem -Path $res -Recurse -Filter 'splash.png' | ForEach-Object {
  $old = [System.Drawing.Image]::FromFile($_.FullName)
  $w = $old.Width; $h = $old.Height
  $old.Dispose()
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'HighQuality'; $g.InterpolationMode = 'HighQualityBicubic'
  $g.Clear([System.Drawing.Color]::White)
  $side = [int]([Math]::Min($w, $h) * 0.32)
  $g.DrawImage($logo, [int](($w - $side) / 2), [int](($h - $side) / 2), $side, $side)
  $g.Dispose()
  $bmp.Save($_.FullName, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
$logo.Dispose()
Write-Output 'icons and launch screens made'
