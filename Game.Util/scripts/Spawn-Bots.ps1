param (
    [int]$NumPlayers = 40,
    [string]$SkillDistribution = "mixed" # mixed, noob, pro, intermediate
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

Write-Host "Spawning $NumPlayers bots (Distribution: $SkillDistribution)... (Press CTRL+C at any time to terminate all spawned bots)"

$batchEntries = @()
$playstyles = @("Balanced", "Balanced", "Aggressive", "Cautious", "KingHunter", "Swarm")

try {
    foreach ($name in $names) {
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        
        $seed = $name.GetHashCode()
        $colorIndex = [Math]::Abs($seed) % $colors.Length
        $color = $colors[$colorIndex]
        $sprite = "ship_$color"
        
        $rand = New-Object System.Random($seed)
        
        # Determine skill level based on distribution
        $skill = 0.5
        switch ($SkillDistribution.ToLowerInvariant()) {
            "noob" {
                $skill = 0.05 + ($rand.NextDouble() * 0.25) # 0.05 - 0.30
            }
            "pro" {
                $skill = 0.75 + ($rand.NextDouble() * 0.23) # 0.75 - 0.98
            }
            "intermediate" {
                $skill = 0.35 + ($rand.NextDouble() * 0.35) # 0.35 - 0.70
            }
            default {
                # Mixed lobby: 30% noobs, 45% intermediate, 25% pro
                $pct = $rand.NextDouble()
                if ($pct -lt 0.30) {
                    $skill = 0.05 + ($rand.NextDouble() * 0.30) # 0.05 - 0.35
                } elseif ($pct -lt 0.75) {
                    $skill = 0.35 + ($rand.NextDouble() * 0.35) # 0.35 - 0.70
                } else {
                    $skill = 0.70 + ($rand.NextDouble() * 0.28) # 0.70 - 0.98
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
