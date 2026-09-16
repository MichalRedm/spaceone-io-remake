param (
    [int]$NumPlayers = 40
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$namesFile = Join-Path $scriptDir "bot_names.txt"

if (-Not (Test-Path $namesFile)) {
    Write-Host "Could not find $namesFile"
    exit 1
}

$colors = @("red", "pink", "cyan", "orange", "blue", "green", "yellow")
$names = Get-Content $namesFile | Get-Random -Count $NumPlayers

$projectDir = Join-Path $scriptDir ".."
$executable = Join-Path $projectDir "bin/Release/net7.0/Game.Util.exe"

if (-Not (Test-Path $executable)) {
    Write-Host "Could not find Game.Util.exe. Building project..."
    dotnet build $projectDir -c Release
}

$botProcesses = @()

Write-Host "Spawning $NumPlayers bots... (Press CTRL+C at any time to terminate all spawned bots)"

$batchEntries = @()

try {
    foreach ($name in $names) {
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        
        $seed = $name.GetHashCode()
        $colorIndex = [Math]::Abs($seed) % $colors.Length
        $color = $colors[$colorIndex]
        $sprite = "ship_$color"
        
        $rand = New-Object System.Random($seed)
        
        $offDash = $rand.Next(10, 31)
        $defDash = $rand.Next(5, 16)
        $targetFleet = $rand.Next(5, 50)
        $flickAim = $rand.Next(85, 100) / 100.0
        $cruiseSpeed = $rand.Next(15, 30) / 100.0
        $safeDist = $rand.Next(400, 700)
        $overshoot = $rand.Next(10, 15) / 10.0
        $curve = $rand.Next(1, 6) / 10.0

        $flickAimStr = $flickAim.ToString([System.Globalization.CultureInfo]::InvariantCulture)
        $cruiseSpeedStr = $cruiseSpeed.ToString([System.Globalization.CultureInfo]::InvariantCulture)
        $overshootStr = $overshoot.ToString([System.Globalization.CultureInfo]::InvariantCulture)
        $curveStr = $curve.ToString([System.Globalization.CultureInfo]::InvariantCulture)
        
        $jsonParams = "{ 'MinimumShipsToOffensiveDash': $offDash, 'MinimumShipsToDefensiveDash': $defDash, 'TargetFleetSize': $targetFleet, 'FlickAimSpeed': $flickAimStr, 'CruisingSpeed': $cruiseSpeedStr, 'SafeDistance': $safeDist, 'OvershootFactor': $overshootStr, 'CurveAmount': $curveStr }"
        
        $batchEntries += @{
            Name = $name
            Color = $color
            Sprite = $sprite
            BotParams = $jsonParams
        }
    }
    
    $batchFile = Join-Path $scriptDir "bot_batch_temp.json"
    $batchEntries | ConvertTo-Json -Depth 3 | Set-Content $batchFile

    $argsList = @(
        "--server", "http://localhost:5000",
        "player", "robots",
        "--type-name", "Game.Robots.Framework.HumanoidBot",
        "--batch", $batchFile
    )
    
    $proc = Start-Process -PassThru -NoNewWindow -FilePath $executable -ArgumentList $argsList
    $botProcesses += $proc
    
    Write-Host "All $NumPlayers bots spawned inside a SINGLE process successfully!"
    Write-Host "Press CTRL+C to close them all."
    while ($true) {
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host "`nCaught termination signal. Cleaning up bot process..."
    foreach ($proc in $botProcesses) {
        if (-Not $proc.HasExited) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
    if (Test-Path $batchFile) {
        Remove-Item $batchFile -ErrorAction SilentlyContinue
    }
    Write-Host "Cleanup complete."
}
