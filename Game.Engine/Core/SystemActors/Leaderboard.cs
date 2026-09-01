namespace Game.Engine.Core.SystemActors
{
    using Game.API.Common;
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Numerics;

    public class LeaderboardActor : SystemActorBase
    {
        protected override void CycleThink()
        {
            CycleMS = World.Hook.LeaderboardRefresh;

            if (World.LeaderboardGenerator != null)
                World.Leaderboard = World.LeaderboardGenerator();
            else
            {
                if (World.Hook.TeamMode)
                    World.Leaderboard = GenerateTeamLeaderboard();
                else
                    World.Leaderboard = GenerateStandardLeaderboard();
            }
        }

        protected Leaderboard GenerateStandardLeaderboard()
        {
            var players = Player.GetWorldPlayers(World);
            var entries = new List<Leaderboard.Entry>(players.Count);
            for (int i = 0; i < players.Count; i++)
            {
                var p = players[i];
                if (p != null && p.IsAlive)
                {
                    entries.Add(new Leaderboard.Entry
                    {
                        FleetID = p.Fleet?.ID ?? 0,
                        Name = p.Name,
                        Score = p.Score,
                        Color = p.Color,
                        Position = p.Fleet?.FleetCenter ?? Vector2.Zero,
                        Token = p.Token
                    });
                }
            }

            entries.Sort((a, b) => b.Score.CompareTo(a.Score));

            var leaderboard = new Leaderboard
            {
                Entries = entries,
                Type = "FFA",
                Time = World.Time,
                ArenaRecord = World.Leaderboard?.ArenaRecord
                    ?? new Leaderboard.Entry()
            };

            var firstPlace = leaderboard.Entries.Count > 0 ? leaderboard.Entries[0] : null;
            if (World.Leaderboard != null && firstPlace?.Score > World.Leaderboard.ArenaRecord.Score)
            {
                leaderboard.ArenaRecord = firstPlace;
                World.ArenaRecordResetTime = World.Time + 86400000;
                World.ArenaRecordHasReset = false;
            }


            if (World.Leaderboard != null && !World.ArenaRecordHasReset && World.Time >= World.ArenaRecordResetTime)
            {
                Console.WriteLine("Arena Record Score Reseting.");
                leaderboard.ArenaRecord.Score = 0;
                leaderboard.ArenaRecord.Name = "";
                leaderboard.ArenaRecord.FleetID = 0;
                World.ArenaRecordHasReset = true;
            }

            return leaderboard;
        }

        protected Leaderboard GenerateTeamLeaderboard()
        {
            var players = Player.GetWorldPlayers(World);
            int cyanScore = 0;
            int redScore = 0;

            var playerEntries = new List<Leaderboard.Entry>(players.Count);
            for (int i = 0; i < players.Count; i++)
            {
                var p = players[i];
                if (p == null) continue;

                if (p.Color == "cyan")
                    cyanScore += p.Score;
                else if (p.Color == "red")
                    redScore += p.Score;

                if (p.IsAlive)
                {
                    playerEntries.Add(new Leaderboard.Entry
                    {
                        FleetID = p.Fleet?.ID ?? 0,
                        Name = p.Name,
                        Score = p.Score,
                        Color = p.Color,
                        Position = p.Fleet?.FleetCenter ?? Vector2.Zero
                    });
                }
            }

            playerEntries.Sort((a, b) =>
            {
                int c = string.CompareOrdinal(a.Color, b.Color);
                return c != 0 ? c : b.Score.CompareTo(a.Score);
            });

            var entries = new List<Leaderboard.Entry>(playerEntries.Count + 2)
            {
                new Leaderboard.Entry
                {
                    Name = "cyan",
                    Score = cyanScore,
                    Color = "cyan"
                },
                new Leaderboard.Entry
                {
                    Name = "red",
                    Score = redScore,
                    Color = "red"
                }
            };
            entries.AddRange(playerEntries);

            return new Leaderboard
            {
                Entries = entries,
                Type = "Team",
                Time = World.Time
            };
        }
    }
}