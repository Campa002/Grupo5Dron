Add-Type -AssemblyName System.Drawing

$imgDir = "C:\Users\Alumnos\Desktop\Grupo5Dron\backend\public\img"
if (!(Test-Path $imgDir)) {
    New-Item -ItemType Directory -Path $imgDir -Force | Out-Null
}

function Generate-Icon([int]$size, [string]$outputPath) {
    $bmp = [System.Drawing.Bitmap]::new($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Colors
    $cBg = [System.Drawing.ColorTranslator]::FromHtml("#0a1628")
    $cBorder = [System.Drawing.ColorTranslator]::FromHtml("#1e3a6e")
    $cPrimary = [System.Drawing.ColorTranslator]::FromHtml("#3b82f6")
    $cCyan = [System.Drawing.ColorTranslator]::FromHtml("#38bdf8")
    $cWhite = [System.Drawing.ColorTranslator]::FromHtml("#f8fafc")

    # Clear Background
    $brushBg = [System.Drawing.SolidBrush]::new($cBg)
    $g.FillRectangle($brushBg, 0, 0, $size, $size)

    # Outer border circle
    $penBorder = [System.Drawing.Pen]::new($cPrimary, [float]($size * 0.04))
    $margin = [float]($size * 0.06)
    $g.DrawEllipse($penBorder, $margin, $margin, [float]($size - 2*$margin), [float]($size - 2*$margin))

    # Inner subtle circle
    $penSubtle = [System.Drawing.Pen]::new($cBorder, [float]($size * 0.02))
    $g.DrawEllipse($penSubtle, [float]($size * 0.12), [float]($size * 0.12), [float]($size * 0.76), [float]($size * 0.76))

    # Center coordinates
    $cx = [float]($size / 2.0)
    $cy = [float]($size / 2.0)

    # Drone cross arms (X shape)
    $penArm = [System.Drawing.Pen]::new($cPrimary, [float]($size * 0.05))
    $armLen = [float]($size * 0.28)
    $g.DrawLine($penArm, [float]($cx - $armLen), [float]($cy - $armLen), [float]($cx + $armLen), [float]($cy + $armLen))
    $g.DrawLine($penArm, [float]($cx - $armLen), [float]($cy + $armLen), [float]($cx + $armLen), [float]($cy - $armLen))

    # 4 Rotors
    $brushRotor = [System.Drawing.SolidBrush]::new($cCyan)
    $penRotor = [System.Drawing.Pen]::new($cWhite, [float]($size * 0.015))
    $rRadius = [float]($size * 0.09)
    $offsets = @(
        @(-$armLen, -$armLen),
        @($armLen, -$armLen),
        @(-$armLen, $armLen),
        @($armLen, $armLen)
    )

    foreach ($off in $offsets) {
        $rx = [float]($cx + $off[0])
        $ry = [float]($cy + $off[1])
        $g.FillEllipse($brushRotor, [float]($rx - $rRadius), [float]($ry - $rRadius), [float]($rRadius * 2), [float]($rRadius * 2))
        $g.DrawEllipse($penRotor, [float]($rx - $rRadius), [float]($ry - $rRadius), [float]($rRadius * 2), [float]($rRadius * 2))
        # Center hub
        $g.FillEllipse([System.Drawing.SolidBrush]::new($cBg), [float]($rx - $rRadius*0.3), [float]($ry - $rRadius*0.3), [float]($rRadius * 0.6), [float]($rRadius * 0.6))
    }

    # Center body hub
    $bodyRadius = [float]($size * 0.16)
    $brushBody = [System.Drawing.SolidBrush]::new($cPrimary)
    $g.FillEllipse($brushBody, [float]($cx - $bodyRadius), [float]($cy - $bodyRadius), [float]($bodyRadius * 2), [float]($bodyRadius * 2))
    $g.DrawEllipse([System.Drawing.Pen]::new($cWhite, [float]($size * 0.02)), [float]($cx - $bodyRadius), [float]($cy - $bodyRadius), [float]($bodyRadius * 2), [float]($bodyRadius * 2))

    # Central Text "G5"
    $fontSize = [float]($size * 0.14)
    $font = [System.Drawing.Font]::new("Arial", $fontSize, [System.Drawing.FontStyle]::Bold)
    $sf = [System.Drawing.StringFormat]::new()
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("G5", $font, [System.Drawing.SolidBrush]::new($cWhite), $cx, [float]($cy + $size*0.01), $sf)

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

Generate-Icon 192 "C:\Users\Alumnos\Desktop\Grupo5Dron\backend\public\img\icon-192.png"
Generate-Icon 512 "C:\Users\Alumnos\Desktop\Grupo5Dron\backend\public\img\icon-512.png"
Generate-Icon 64  "C:\Users\Alumnos\Desktop\Grupo5Dron\backend\public\favicon.ico"

Write-Host "Icons generated successfully!"
