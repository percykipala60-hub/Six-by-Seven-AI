$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$palette = Get-Content (Join-Path $root 'lib\theme-colors.json') -Raw | ConvertFrom-Json
$themes = @($palette.accents) + @($palette.ambiances)
$glyphe = [System.Drawing.Bitmap]::FromFile((Join-Path $root 'public\six-glyphe.png'))
$trait = [System.Drawing.Bitmap]::FromFile((Join-Path $root 'public\six-trait.png'))
$size = 1024

function Get-Color([string] $value) {
    return [System.Drawing.ColorTranslator]::FromHtml($value)
}

function New-TintedLayer([System.Drawing.Bitmap] $source, [System.Drawing.Color] $color) {
    $image = New-Object System.Drawing.Bitmap(
        $source.Width,
        $source.Height,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    for ($y = 0; $y -lt $source.Height; $y++) {
        for ($x = 0; $x -lt $source.Width; $x++) {
            $pixel = $source.GetPixel($x, $y)
            if ($pixel.A -gt 0) {
                $image.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(
                    $pixel.A,
                    $color.R,
                    $color.G,
                    $color.B
                ))
            }
        }
    }
    return $image
}

foreach ($theme in $themes) {
    $androidDir = Join-Path $root 'android\app\src\main\res\drawable-nodpi'
    $iosDir = Join-Path $root "ios\App\App\Assets.xcassets\AppIcon-$($theme.id).appiconset"
    [System.IO.Directory]::CreateDirectory($androidDir) | Out-Null
    [System.IO.Directory]::CreateDirectory($iosDir) | Out-Null

    $image = New-Object System.Drawing.Bitmap(
        $size,
        $size,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($image)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $background = $theme.icon.background

    if ($theme.gradient) {
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            (New-Object System.Drawing.Rectangle(0, 0, $size, $size)),
            (Get-Color $theme.gradient[0]),
            (Get-Color $theme.gradient[$theme.gradient.Count - 1]),
            45.0
        )
    } else {
        $brush = New-Object System.Drawing.SolidBrush((Get-Color $background))
    }

    $graphics.FillRectangle($brush, 0, 0, $size, $size)
    $brush.Dispose()

    if ($theme.ring) {
        $ring = New-Object System.Drawing.Pen((Get-Color '#ffffff'), 10)
        $graphics.DrawEllipse($ring, 28, 28, $size - 56, $size - 56)
        $ring.Dispose()
    }

    $glyphColor = Get-Color $theme.icon.ink
    $accentColor = Get-Color $theme.icon.accent
    $glyphImage = New-TintedLayer $glyphe $glyphColor
    $accentImage = New-TintedLayer $trait $accentColor
    $bounds = New-Object System.Drawing.Rectangle(112, 112, 800, 800)
    $graphics.DrawImage($glyphImage, $bounds)
    $graphics.DrawImage($accentImage, $bounds)

    $androidPath = Join-Path $androidDir "six_theme_$($theme.id).png"
    $iosPath = Join-Path $iosDir "AppIcon-$($theme.id).png"
    $image.Save($androidPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $image.Save($iosPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $contents = @{
        images = @(@{
            filename = "AppIcon-$($theme.id).png"
            idiom = 'universal'
            platform = 'ios'
            size = '1024x1024'
        })
        info = @{ author = 'xcode'; version = 1 }
    } | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText(
        (Join-Path $iosDir 'Contents.json'),
        $contents,
        [System.Text.UTF8Encoding]::new($false)
    )

    $glyphImage.Dispose()
    $accentImage.Dispose()
    $graphics.Dispose()
    $image.Dispose()
}

$glyphe.Dispose()
$trait.Dispose()
