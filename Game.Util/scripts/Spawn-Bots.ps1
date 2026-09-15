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

foreach ($name in $names) {
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    
    # Generate a deterministic integer seed from the username's characters
    $seed = $name.GetHashCode()
    
    # Pick color deterministically based on the seed
    $colorIndex = [Math]::Abs($seed) % $colors.Length
    $color = $colors[$colorIndex]
    $sprite = "ship_$color"
    
    # Initialize a new random number generator using our deterministic seed
    $rand = New-Object System.Random($seed)
    
    # Roll the personality traits (these will now always be exactly the same for this username)
    $offDash = $rand.Next(10, 31)
    $defDash = $rand.Next(5, 16)
    $targetFleet = $rand.Next(15, 41)
    $flickAim = $rand.Next(85, 100) / 100.0
    $cruiseSpeed = $rand.Next(15, 30) / 100.0
    $safeDist = $rand.Next(400, 700)
    $overshoot = $rand.Next(10, 15) / 10.0
    $curve = $rand.Next(1, 6) / 10.0

    $flickAimStr = $flickAim.ToString([System.Globalization.CultureInfo]::InvariantCulture)
    $cruiseSpeedStr = $cruiseSpeed.ToString([System.Globalization.CultureInfo]::InvariantCulture)
    $overshootStr = $overshoot.ToString([System.Globalization.CultureInfo]::InvariantCulture)
    $curveStr = $curve.ToString([System.Globalization.CultureInfo]::InvariantCulture)
    
    # Create the JSON override payload
    $jsonParams = "{ `"MinimumShipsToOffensiveDash`": $offDash, `"MinimumShipsToDefensiveDash`": $defDash, `"TargetFleetSize`": $targetFleet, `"FlickAimSpeed`": $flickAimStr, `"CruisingSpeed`": $cruiseSpeedStr, `"SafeDistance`": $safeDist, `"OvershootFactor`": $overshootStr, `"CurveAmount`": $curveStr }"

    # Project directory is two levels up from the script
    $projectDir = Join-Path $scriptDir ".."
    
    Start-Process -NoNewWindow dotnet -ArgumentList "run --project `"$projectDir`" --no-build --server http://localhost:5000 player robots --type-name Game.Robots.Framework.HumanoidBot --name `"$name`" --color `"$color`" --sprite `"$sprite`" --bot-params `"$jsonParams`""
    
    Start-Sleep -Seconds 0.5
}
