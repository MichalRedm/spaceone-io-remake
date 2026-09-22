param (
    [int]$NumPlayers = 40,
    [string]$SkillDistribution = "realistic", # realistic, mixed, noob, pro, intermediate, uniform
    [switch]$NoBuild = $false
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

if (-Not $NoBuild) {
    Write-Host "Ensuring Game.Util is built in Release mode..." -ForegroundColor Cyan
    dotnet build $projectDir -c Release
} elseif (-Not (Test-Path $executable)) {
    Write-Host "Could not find Game.Util.exe. Building project..."
    dotnet build $projectDir -c Release
}

$botProcesses = @()
$batchEntries = @()
$playstyles = @("Balanced", "Balanced", "Aggressive", "Cautious", "KingHunter", "Swarm")

$counts = @{
    "Beginner (0.02 - 0.25)" = 0
    "Casual   (0.25 - 0.50)" = 0
    "Skilled  (0.50 - 0.75)" = 0
    "Pro      (0.75 - 0.98)" = 0
}

$rosterSummary = @()

foreach ($name in $names) {
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    
    $seed = $name.GetHashCode()
    $colorIndex = [Math]::Abs($seed) % $colors.Length
    $color = $colors[$colorIndex]
    $sprite = "ship_$color"
    
    $rand = New-Object System.Random($seed)
    
    # Determine skill level based on distribution
    $skill = 0.5
    $tier = ""
    switch ($SkillDistribution.ToLowerInvariant()) {
        "noob" {
            $skill = 0.02 + ($rand.NextDouble() * 0.22) # 0.02 - 0.24
            $tier = "NOOB"
            $counts["Beginner (0.02 - 0.25)"]++
        }
        "pro" {
            $skill = 0.75 + ($rand.NextDouble() * 0.23) # 0.75 - 0.98
            $tier = "PRO"
            $counts["Pro      (0.75 - 0.98)"]++
        }
        "intermediate" {
            $skill = 0.35 + ($rand.NextDouble() * 0.35) # 0.35 - 0.70
            $tier = "CASUAL"
            $counts["Casual   (0.25 - 0.50)"]++
        }
        "uniform" {
            $skill = 0.02 + ($rand.NextDouble() * 0.96) # 0.02 - 0.98
            if ($skill -lt 0.25) { $tier = "NOOB"; $counts["Beginner (0.02 - 0.25)"]++ }
            elseif ($skill -lt 0.50) { $tier = "CASUAL"; $counts["Casual   (0.25 - 0.50)"]++ }
            elseif ($skill -lt 0.75) { $tier = "SKILLED"; $counts["Skilled  (0.50 - 0.75)"]++ }
            else { $tier = "PRO"; $counts["Pro      (0.75 - 0.98)"]++ }
        }
        default {
            # "realistic" / "mixed":
            # Realistic casual game pyramid:
            # 35% Beginners (0.02 - 0.25)
            # 35% Casuals   (0.25 - 0.50)
            # 20% Skilled   (0.50 - 0.75)
            # 10% Pros      (0.75 - 0.98)
            $pct = $rand.NextDouble()
            if ($pct -lt 0.35) {
                $skill = 0.02 + ($rand.NextDouble() * 0.23)
                $tier = "NOOB"
                $counts["Beginner (0.02 - 0.25)"]++
            } elseif ($pct -lt 0.70) {
                $skill = 0.25 + ($rand.NextDouble() * 0.25)
                $tier = "CASUAL"
                $counts["Casual   (0.25 - 0.50)"]++
            } elseif ($pct -lt 0.90) {
                $skill = 0.50 + ($rand.NextDouble() * 0.25)
                $tier = "SKILLED"
                $counts["Skilled  (0.50 - 0.75)"]++
            } else {
                $skill = 0.75 + ($rand.NextDouble() * 0.23)
                $tier = "PRO"
                $counts["Pro      (0.75 - 0.98)"]++
            }
        }
    }
    
    $styleIndex = $rand.Next(0, $playstyles.Length)
    $playstyle = $playstyles[$styleIndex]
    
    $skillStr = [Math]::Round($skill, 3).ToString([System.Globalization.CultureInfo]::InvariantCulture)
    $jsonParams = "{ 'SkillLevel': $skillStr, 'Playstyle': '$playstyle' }"
    
    $batchEntries += @{
        Name = $name
        Color = $color
        Sprite = $sprite
        BotParams = $jsonParams
    }

    $rosterSummary += [PSCustomObject]@{
        Tier      = $tier
        Name      = $name
        Color     = $color
        Skill     = [Math]::Round($skill, 2)
        Playstyle = $playstyle
    }
}

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host " Spawning $NumPlayers bots with '$SkillDistribution' skill distribution:" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
foreach ($key in $counts.Keys | Sort-Object) {
    $c = $counts[$key]
    $pctStr = [Math]::Round(($c / [Math]::Max(1, $NumPlayers)) * 100, 1)
    Write-Host ("  {0,-26} : {1,2} bots ({2,4}%)" -f $key, $c, $pctStr) -ForegroundColor Yellow
}
Write-Host "------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host " Roster preview (first 10 bots):" -ForegroundColor Gray
$rosterSummary | Select-Object -First 10 | Format-Table -AutoSize | Out-String | Write-Host -ForegroundColor DarkGray
Write-Host "========================================================================" -ForegroundColor Cyan

$batchFile = Join-Path $scriptDir "bot_batch_temp.json"
$batchEntries | ConvertTo-Json -Depth 3 | Set-Content $batchFile

$argsList = @(
    "--server", "http://localhost:5000",
    "player", "robots",
    "--type-name", "Game.Robots.Framework.HumanoidBot",
    "--batch", $batchFile
)

try {
    $proc = Start-Process -PassThru -NoNewWindow -FilePath $executable -ArgumentList $argsList
    $botProcesses += $proc
    
    Write-Host "All $NumPlayers bots spawned inside a SINGLE process successfully!" -ForegroundColor Green
    Write-Host "Press CTRL+C at any time to close them all." -ForegroundColor White
    while ($true) {
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host "`nCaught termination signal. Cleaning up bot process..." -ForegroundColor Yellow
    foreach ($proc in $botProcesses) {
        if (-Not $proc.HasExited) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
    if (Test-Path $batchFile) {
        Remove-Item $batchFile -ErrorAction SilentlyContinue
    }
    Write-Host "Cleanup complete." -ForegroundColor Green
}
