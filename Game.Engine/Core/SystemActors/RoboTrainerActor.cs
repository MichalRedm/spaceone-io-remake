namespace Game.Engine.Core.SystemActors
{
    using Game.API.Common.Models;
    using System;
    using System.Collections.Generic;

    /// <summary>
    /// Adaptive Combat Pressure Controller (ACPC - Frontier Overload) for RoboTrainer.
    /// Dynamically scales bot populations to stress-test players and find their true skill ceiling,
    /// scaling smoothly from baseline (3 bots) up to 20+ bots based on fleet firepower, survival longevity,
    /// kill streaks, and multi-player demand.
    /// </summary>
    public sealed class RoboTrainerActor : SystemActorBase
    {
        private const int EventCapacity = 64;

        private readonly struct EventRecord
        {
            public readonly uint Time;
            public readonly string PlayerId;
            public readonly bool IsKill;

            public EventRecord(uint time, string playerId, bool isKill)
            {
                Time = time;
                PlayerId = playerId;
                IsKill = isKill;
            }
        }

        private readonly EventRecord[] _eventBuffer = new EventRecord[EventCapacity];
        private int _eventHead = 0;
        private int _eventCount = 0;

        private readonly Dictionary<string, int> _lastKnownKills = new Dictionary<string, int>();
        private readonly Dictionary<string, int> _lastKnownDeaths = new Dictionary<string, int>();
        private readonly Dictionary<string, int> _playerPeakFleetSize = new Dictionary<string, int>();

        private long _lastAdjustmentTime = 0;
        private int _currentDesiredBots = 3;

        public RoboTrainerActor()
        {
            CycleMS = 1000;
        }

        public override void Init(World world)
        {
            base.Init(world);
            _currentDesiredBots = Math.Max(3, world.Hook.BotBase);
        }

        private void RecordEvent(uint time, string playerId, bool isKill)
        {
            _eventBuffer[_eventHead] = new EventRecord(time, playerId, isKill);
            _eventHead = (_eventHead + 1) % EventCapacity;
            if (_eventCount < EventCapacity)
                _eventCount++;
        }

        private int CountEventsInWindow(string playerId, uint currentTime, uint windowMs, bool isKill)
        {
            int count = 0;
            uint cutoff = currentTime > windowMs ? currentTime - windowMs : 0;

            for (int i = 0; i < _eventCount; i++)
            {
                ref readonly var evt = ref _eventBuffer[i];
                if (evt.IsKill == isKill && evt.PlayerId == playerId && evt.Time >= cutoff && evt.Time <= currentTime)
                {
                    count++;
                }
            }
            return count;
        }

        protected override void CycleThink()
        {
            if (World == null || !World.Hook.RoboTrainerMode)
                return;

            var hook = World.Hook;
            var players = Player.GetWorldPlayers(World);
            uint currentTime = World.Time;

            // 1. Gather active human players and bots (Zero LINQ)
            int humanCount = 0;
            int activeBotCount = 0;
            int totalBotCount = 0;
            bool recentHumanDeathDetected = false;
            bool severeSpawnCampDetected = false;

            for (int i = 0; i < players.Count; i++)
            {
                var p = players[i];
                if (p == null) continue;

                bool isRobot = p is Robot || (p.Name != null && p.Name.StartsWith("🤖"));

                if (isRobot)
                {
                    totalBotCount++;
                    if (p.IsAlive && p.Fleet != null && p.Fleet.Ships.Count > 0)
                    {
                        activeBotCount++;
                    }
                }
                else
                {
                    // Track human kills of bots
                    if (_lastKnownKills.TryGetValue(p.PlayerID, out int lastKills))
                    {
                        if (p.KillCount > lastKills)
                        {
                            int newKills = p.KillCount - lastKills;
                            for (int k = 0; k < newKills; k++)
                                RecordEvent(currentTime, p.PlayerID, true);
                            _lastKnownKills[p.PlayerID] = p.KillCount;
                        }
                    }
                    else
                    {
                        _lastKnownKills[p.PlayerID] = p.KillCount;
                    }

                    // Track human deaths
                    if (_lastKnownDeaths.TryGetValue(p.PlayerID, out int lastDeaths))
                    {
                        if (p.DeathCount > lastDeaths)
                        {
                            int newDeaths = p.DeathCount - lastDeaths;
                            for (int d = 0; d < newDeaths; d++)
                                RecordEvent(currentTime, p.PlayerID, false);
                            _lastKnownDeaths[p.PlayerID] = p.DeathCount;

                            // Reset peak fleet on death
                            _playerPeakFleetSize[p.PlayerID] = 0;

                            recentHumanDeathDetected = true;
                            if (p.AliveSince > 0 && currentTime - p.AliveSince < 10000)
                            {
                                severeSpawnCampDetected = true;
                            }
                        }
                    }
                    else
                    {
                        _lastKnownDeaths[p.PlayerID] = p.DeathCount;
                    }

                    if (p.IsAlive && p.Fleet != null && p.Fleet.Ships.Count > 0)
                    {
                        humanCount++;

                        // Update peak fleet size
                        int curFleet = p.Fleet.Ships.Count;
                        if (!_playerPeakFleetSize.TryGetValue(p.PlayerID, out int prevPeak) || curFleet > prevPeak)
                        {
                            _playerPeakFleetSize[p.PlayerID] = curFleet;
                        }
                    }
                }
            }

            // Idle state: No active human players -> reset to baseline
            int minBase = Math.Max(3, hook.RoboTrainerMinBots);
            if (humanCount == 0)
            {
                _currentDesiredBots = minBase;
                hook.BotBase = _currentDesiredBots;
                return;
            }

            // Emergency Relief on Human Death
            if (recentHumanDeathDetected && _currentDesiredBots > minBase)
            {
                int relief = severeSpawnCampDetected ? Math.Max(2, (_currentDesiredBots - minBase)) : (_currentDesiredBots > 6 ? 3 : 1);
                _currentDesiredBots = Math.Max(minBase, _currentDesiredBots - relief);
                hook.BotBase = _currentDesiredBots;
                _lastAdjustmentTime = currentTime;
                return;
            }

            // 2. Evaluate progressive overload demand per human player
            int aggregateDemand = 0;
            int maxIndividualBots = minBase + hook.RoboTrainerMaxBotsPerPlayer;

            for (int i = 0; i < players.Count; i++)
            {
                var p = players[i];
                if (p == null) continue;
                bool isRobot = p is Robot || (p.Name != null && p.Name.StartsWith("🤖"));
                if (isRobot || !p.IsAlive || p.Fleet == null) continue;

                int fleetSize = p.Fleet.Ships.Count;

                // A. Direct Fleet Scale Factor (Firepower & Bulk)
                // In Spaceone, 1 ship vs 50 ships represents an immense difference in firepower
                float fleetFactor;
                if (fleetSize <= 3)
                    fleetFactor = 0f;
                else if (fleetSize <= 8)
                    fleetFactor = (fleetSize - 3) * 0.40f; // 0 to 2 bots
                else if (fleetSize <= 15)
                    fleetFactor = 2.0f + (fleetSize - 8) * 0.45f; // 2 to 5.15 bots
                else if (fleetSize <= 30)
                    fleetFactor = 5.15f + (fleetSize - 15) * 0.35f; // 5.15 to 10.4 bots
                else if (fleetSize <= 50)
                    fleetFactor = 10.4f + (fleetSize - 30) * 0.25f; // 10.4 to 15.4 bots
                else
                    fleetFactor = MathF.Min(18.0f, 15.4f + (fleetSize - 50) * 0.15f); // up to 18 bots

                // B. Survival Longevity & Kill Streak Momentum (Progressive Escalation)
                float aliveSeconds = (currentTime > p.AliveSince) ? (currentTime - p.AliveSince) / 1000f : 0f;
                float survivalFactor = MathF.Min(5.0f, aliveSeconds / 15.0f); // +1 bot per 15s survived, up to +5
                float streakFactor = MathF.Min(5.0f, p.KillStreak / 2.5f); // +1 bot per 2.5 streak, up to +5

                // C. Kill Velocity
                int killsIn20s = CountEventsInWindow(p.PlayerID, currentTime, 20000, true);
                float killFactor = MathF.Min(4.0f, killsIn20s * 0.75f);

                // D. Recent Deaths Penalty
                int deathsIn30s = CountEventsInWindow(p.PlayerID, currentTime, 30000, false);
                float deathPenalty = deathsIn30s * 4.0f;

                // E. Fleet Strain / Heavy Loss Braking
                // If the player recently lost >60% of their peak fleet, ease the pressure so they can recover
                float strainPenalty = 0f;
                if (_playerPeakFleetSize.TryGetValue(p.PlayerID, out int peak) && peak >= 15 && fleetSize <= peak * 0.40f)
                {
                    strainPenalty = 3.0f;
                }

                // Compute individual desired bot count
                float totalDemandScore = fleetFactor + survivalFactor + streakFactor + killFactor - deathPenalty - strainPenalty;
                int individualBots = Math.Clamp(minBase + (int)MathF.Floor(totalDemandScore), minBase, maxIndividualBots);

                aggregateDemand += individualBots;
            }

            // 3. Global Arena Bounds
            int minTarget = Math.Max(minBase, 2 * humanCount);
            int maxTarget = minBase + (hook.RoboTrainerMaxBotsPerPlayer * humanCount);
            int targetBots = Math.Clamp(aggregateDemand, minTarget, maxTarget);

            // 4. Adaptive Ramp Adjustment with Fast-Track for Dominant Players
            if (targetBots > _currentDesiredBots)
            {
                if (currentTime >= _lastAdjustmentTime + hook.RoboTrainerRampUpDelay)
                {
                    int step = (targetBots - _currentDesiredBots >= 4) ? 2 : 1;
                    _currentDesiredBots = Math.Min(targetBots, _currentDesiredBots + step);
                    _lastAdjustmentTime = currentTime;
                }
            }
            else if (targetBots < _currentDesiredBots)
            {
                if (currentTime >= _lastAdjustmentTime + hook.RoboTrainerRampDownDelay)
                {
                    _currentDesiredBots--;
                    _lastAdjustmentTime = currentTime;
                }
            }

            hook.BotBase = _currentDesiredBots;
        }
    }
}
