namespace Game.Engine.Core.Scoring
{
    using System;

    public class DefaultScoring : ScoringBase
    {
        public override void ShipDied(Player killer, Player victim, Ship ship)
        {
            if (killer != null && !(ship is Fish) && ship.AbandonedByFleet != killer.Fleet)
                killer.Score += killer.World.Hook.PointsPerKillShip;
        }

        public override void FleetDied(Player killer, Player victim, Fleet fleet)
        {
            var hook = fleet.World.Hook;
            var time = fleet.World.Time;

            if (killer != null && victim != null)
            {
                try
                {
                    killer.LastKillTime = time;
                    
                    var entries =  killer.World.Leaderboard.Entries;
                    
                    int plusScore = 5;
                    for (var i = 0; i < entries.Count; i++) {
                        if (entries[i]?.FleetID == victim?.Fleet?.ID && i < 10) {
                            plusScore = (Math.Min(entries.Count - 1, 10) - i + 1) * 5;
                        }
                    }
                    
                    /*int plusScore = (int)(hook.PointsPerKillFleetStep * (MathF.Floor(victim.Score / hook.PointsPerKillFleetPerStep) + 1));
                    plusScore = (plusScore < hook.PointsPerKillFleetMax) ? plusScore : hook.PointsPerKillFleetMax;*/
                    killer.Score += plusScore;
                    killer.KillStreak++;
                    killer.KillCount++;
                    killer.SendMessage($"You Killed {victim.Name}", "kill",
                        plusScore,
                        new
                        {
                            ping = new
                            {
                                you = killer?.Connection?.Latency ?? 0,
                                them = victim?.Connection?.Latency ?? 0
                            },
                            stats = new
                            {
                                kills = killer.KillCount,
                                deaths = killer.DeathCount
                            }
                        }
                    );

                    victim.DeathCount++;
                    victim.SendMessage($"Killed by {killer.Name}", "killed",
                        victim.Score,
                        new
                        {
                            score = victim.Score,
                            kills = victim.KillStreak,
                            gameTime = time - victim.AliveSince,
                            ping = new
                            {
                                you = victim.Connection?.Latency ?? 0,
                                them = killer?.Connection?.Latency ?? 0
                            },
                            stats = new
                            {
                                kills = victim.KillCount,
                                deaths = victim.DeathCount
                            }
                        }
                    );
                    victim.Score = (int)Math.Max(victim.Score * hook.PointsMultiplierDeath + 1, 0);
                    victim.KillStreak = 0;
                }
                catch (Exception e)
                {
                    Console.WriteLine($"Exception while scoring and sending messages: {e}");
                }
            }
            else
            {
                if (victim != null)
                {
                    victim.Score += hook.PointsPerUniverseDeath;
                    victim.KillStreak = 0;
                    victim.DeathCount++;
                    victim.SendMessage($"Killed by the universe", "universeDeath", hook.PointsPerUniverseDeath,
                        new
                        {
                            score = victim.Score,
                            kills = victim.KillStreak,
                            gameTime = fleet.World.Time - victim.AliveSince,
                            stats = new
                            {
                                kills = victim.KillCount,
                                deaths = victim.DeathCount
                            }
                        }
                    );
                    victim.Score = (int)Math.Max(victim.Score * hook.PointsMultiplierDeath, 0);
                }
            }

            base.FleetDied(killer, victim, fleet);
        }
    }
}
