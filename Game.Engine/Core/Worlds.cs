namespace Game.Engine.Core
{
    using Game.API.Common.Models;
    using System;
    using System.Collections.Generic;
    using System.Linq;

    public static class Worlds
    {
        public static readonly Dictionary<string, World> AllWorlds = new Dictionary<string, World>();
        private static GameConfiguration GameConfiguration;

        private static World Default;

        public static void Initialize(GameConfiguration gameConfiguration)
        {
            GameConfiguration = gameConfiguration;

            if (!gameConfiguration.NoWorlds)
            {
                Default = WorldDefault();
                AddWorld("default", Default);
                AddWorld("duel", WorldDuel());
                AddWorld("team", WorldTeam());
                AddWorld("ctf", WorldCTF());
                AddWorld("robo", RoboTrainer());
            }
            /*
            AddWorld("sharks", WorldSharks());
            AddWorld("sumo", WorldSumo());
            AddWorld("boss", WorldBoss());
            */
            //AddWorld("wormhole", WorldWormhole());
            //AddWorld("beach", WorldBeach());

        }

        public static void Destroy(string worldKey)
        {
            var world = Find(worldKey);

            if (world != null && world.WorldKey == worldKey)
                Destroy(world);
        }

        public static void Destroy(World world)
        {
            try
            {
                if (AllWorlds.ContainsKey(world.WorldKey))
                    AllWorlds.Remove(world.WorldKey);
            }
            catch (Exception) { }
            try
            {
                ((IDisposable)world).Dispose();
            }
            catch (Exception) { }
        }

        public static void AddWorld(World world)
        {
            EnsureUniqueArenaID(world);
            AllWorlds.Add(world.WorldKey, world);
        }

        public static void AddWorld(string worldKey, World world)
        {
            world.WorldKey = worldKey;
            EnsureUniqueArenaID(world);
            AllWorlds.Add(world.WorldKey, world);
        }

        private static void EnsureUniqueArenaID(World world)
        {
            if (string.IsNullOrWhiteSpace(world.ArenaID))
                world.ArenaID = World.GenerateArenaID();

            while (AllWorlds.Values.Any(w => w != world && string.Equals(w.ArenaID, world.ArenaID, StringComparison.OrdinalIgnoreCase)))
            {
                world.ArenaID = World.GenerateArenaID();
            }
        }

        private static World WorldDefault()
        {
            var hook = Hook.Default;
            hook.Name = "FFA";
            hook.Description = "FFA Arena";
            hook.Instructions = "Mouse to aim, click to shoot. Press 's' to boost.";
            hook.Weight = 10;

            return new World(hook, GameConfiguration);
        }

        private static World WorldOther()
        {
            var hook = Hook.Default;
            hook.BotBase = 10;
            hook.BotRespawnDelay = 0;
            hook.PickupShields = 10;
            hook.ComboDelay = 2000;

            hook.Name = "Planet Daud";
            hook.Description = "AAAAAHHH! Run!";
            hook.AllowedColors = Hook.AllColors.Append("ship0").ToArray();
            hook.Weight = 100;

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        private static World RoboTrainer()
        {
            var hook = Hook.Default;
            hook.Name = "Robo Trainer";
            hook.Description = "Battle against bots of different difficulty levels";
            hook.WorldSize = Hook.Default.WorldSize / 2;
            hook.Fishes = Hook.Default.Fishes / 4;
            hook.Obstacles = 0;
            hook.PickupSeekers = 0;
            hook.PickupShields = 0;
            hook.AllowedColors = Hook.AllColors;
            hook.Weight = 100;
            hook.BotBase = 3;
            hook.RoboTrainerMode = true;
            hook.RoboTrainerMinBots = 3;

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        private static World WorldSnake()
        {
            var hook = Hook.Default;
            hook.BotBase = 1;
            hook.FlockWeight = 0;
            hook.SnakeWeight = 0.01f;
            hook.FlockWeight = 0.02f;
            hook.FlockCohesion = 0.0003f;
            hook.FlockAlignment = 0;
            hook.FollowFirstShip = true;
            hook.FiringSequenceDelay = 250;

            hook.Name = "Snake World";
            hook.Description = "Hisssssss...";
            hook.AllowedColors = Hook.AllColors.Append("ship0").ToArray();

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        private static World WorldSumo()
        {
            var hook = Hook.Default;
            hook.BotBase = 0;
            hook.WorldSize = 1500;
            hook.Obstacles = 0;
            hook.Fishes = 20;
            hook.PickupSeekers = 0;
            hook.SpawnInvulnerabilityTime = 0;
            hook.PickupShields = 0;
            hook.SpawnShipCount = 10;
            hook.PointsPerKillFleet = 1;
            hook.PointsPerKillShip = 0;
            hook.PointsPerUniverseDeath = 0;
            hook.PointsMultiplierDeath = 1.0f;
            hook.SumoMode = true;
            hook.SumoRingSize = 1000;
            hook.Weight = 100;

            hook.Name = "Sumo World";
            hook.Description = "Bigger Better...";

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        private static World WorldDuel()
        {
            var hook = Hook.Default;
            hook.BotBase = 0;
            hook.WorldSize = Hook.Default.WorldSize / 2;
            hook.Fishes = Hook.Default.Fishes / 4;
            hook.Obstacles = 0;
            hook.PickupSeekers = 0;
            hook.PickupShields = 0;
            hook.PointsPerKillFleet = 1;
            hook.PointsPerKillShip = 0;
            hook.PointsPerUniverseDeath = -1;
            hook.PointsMultiplierDeath = 1.0f;
            hook.Weight = 20;

            hook.Name = "Dueling Room";
            hook.Description = "1 vs. 1";
            hook.AllowedColors = Hook.AllColors;

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        private static World WorldTeam()
        {
            var hook = Hook.Default;
            hook.BotBase = 0;
            hook.WorldSize = Hook.Default.WorldSize;
            hook.Fishes = Hook.Default.Fishes;
            hook.Obstacles = 0;
            hook.PickupSeekers = 0;
            hook.PickupShields = 0;
            hook.TeamMode = true;
            hook.Weight = 20;

            hook.Name = "Team";
            hook.Description = "Blue vs. Red";
            hook.AllowedColors = Hook.TeamColors;

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        private static World WorldCTF()
        {
            var hook = Hook.Default;
            hook.BotBase = 0;
            hook.WorldSize = Hook.Default.WorldSize;
            hook.Fishes = Hook.Default.Fishes;
            hook.Obstacles = 0;
            hook.PickupSeekers = 0;
            hook.PickupShields = 0;
            hook.CTFMode = true;
            hook.TeamMode = true;
            hook.PointsPerKillFleet = 1;
            hook.PointsPerKillShip = 0;
            hook.PointsPerUniverseDeath = -1;
            hook.PointsMultiplierDeath = 1.0f;
            hook.Weight = 20;
            hook.SpawnLocationMode = "CTF";

            hook.Name = "Capture the Flag";
            hook.Description = "Blue vs. Red - Capture the Flag. First to 5 wins!";
            hook.Instructions = @"<p>features two teams, blue and red, 
                    who each try to steal the other team's
                    flag and bring it back to their own 
                    base to 'capture'.</p>
                    <p>each team will have their own base and flag to defend. In order to score, your team's flag must still be 
                    at your base, which means you'll have to have some good defense to keep
                    the other team from running off with your flag.</p>
                    <p>If someone makes off with your flag, frag them and they'll drop your flag -- 
                    touch the flag and it will be returned
                    to your base.</p>";

            hook.AllowedColors = Hook.TeamColors;

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        private static World WorldSharks()
        {
            var hook = Hook.Default;
            hook.BotBase = 0;
            hook.Obstacles = 0;
            hook.TeamMode = true;
            hook.PointsPerKillFleet = 1;
            hook.PointsPerKillShip = 0;
            hook.PointsMultiplierDeath = 1.0f;
            hook.WorldSize /= 2;
            hook.Weight = 100;

            hook.Name = "Sharks and Minnows";
            hook.Description = "Sharks and Minnows";
            hook.Instructions = "how to score:<br><br>"
                    + " - Sharks (red) hunt<br>"
                    + " - Minnows (blue) run towards borders (left & right)";

            hook.AllowedColors = Hook.TeamColors;
            hook.SharksAndMinnowsMode = true;

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration)
            {
                NewFleetGenerator = delegate (Player p, string Color)
                {
                    return new Fleet
                    {
                        Owner = p,
                        Caption = p.Name,
                        Color = Color,
                        Shark = Color == "red",
                    };
                }
            };
        }

        private static World WorldWormhole()
        {
            var hook = Hook.Default;
            hook.WorldSize = 1000;
            hook.BotBase = 0;
            hook.Obstacles = 0;
            hook.Wormholes = 1;
            hook.WormholesDestination = "duel";
            hook.Name = "Wormhole test";
            hook.Description = "Wormhole test";
            hook.AllowedColors = Hook.TeamColors;
            hook.Weight = 1000;

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        private static World WorldBoss()
        {
            var hook = Hook.Default;
            hook.BotBase = 3;
            hook.BossMode = true;
            hook.BossModeSprites = new API.Common.Sprites[] { API.Common.Sprites.ship0 };
            hook.ShotCooldownTimeBotB = 200;
            hook.SpawnShipCount = 3;
            hook.Name = "Boss Mode";
            hook.Description = "So many Circles! Much wow!";
            hook.AllowedColors = Hook.AllColors.Append("ship0").ToArray();
            hook.Weight = 100;

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        private static World WorldBeach()
        {
            var hook = Hook.Default;
            hook.BotBase = 0;
            hook.MapEnabled = true;
            hook.SpawnLocationMode = "Static";
            hook.Name = "Beach World";
            hook.Description = "Come on in, the water's fine";
            hook.Weight = 1000;

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        public static World FindExact(string world = null)
        {
            if (string.IsNullOrWhiteSpace(world))
                return null;

            var key = world.Trim();

            // 1. Direct match in AllWorlds
            if (AllWorlds.TryGetValue(key, out var exactWorld))
                return exactWorld;

            // 2. Check if world string is in format "host/target" or "region/target"
            var slashIndex = key.LastIndexOf('/');
            if (slashIndex >= 0 && slashIndex < key.Length - 1)
            {
                var subKey = key.Substring(slashIndex + 1);
                var subResolved = FindExact(subKey);
                if (subResolved != null)
                    return subResolved;
            }

            // 3. Check direct ArenaID match (e.g. "xK92Lp")
            var byArena = AllWorlds.Values.FirstOrDefault(w => string.Equals(w.ArenaID, key, StringComparison.OrdinalIgnoreCase));
            if (byArena != null)
                return byArena;

            // 4. Check compound identifier with colon: "mode:arenaId", "region:mode:arenaId", "private:arenaId"
            if (key.Contains(':'))
            {
                var parts = key.Split(':');
                var potentialArenaId = parts[^1];
                if (!string.IsNullOrWhiteSpace(potentialArenaId))
                {
                    var byCompoundArena = AllWorlds.Values.FirstOrDefault(w => string.Equals(w.ArenaID, potentialArenaId, StringComparison.OrdinalIgnoreCase));
                    if (byCompoundArena != null)
                        return byCompoundArena;
                }

                // If specific arena ID was not found (expired/restarted), fallback to mode if not private
                var modePrefix = parts.Length >= 2 ? (parts.Length == 2 ? parts[0] : parts[1]) : null;
                if (!string.IsNullOrWhiteSpace(modePrefix) && !string.Equals(modePrefix, "private", StringComparison.OrdinalIgnoreCase) && !string.Equals(modePrefix, "p", StringComparison.OrdinalIgnoreCase))
                {
                    if (AllWorlds.TryGetValue(modePrefix, out var modeFallback))
                        return modeFallback;

                    var byGameMode = AllWorlds.Values.FirstOrDefault(w => string.Equals(w.GameMode, modePrefix, StringComparison.OrdinalIgnoreCase));
                    if (byGameMode != null)
                        return byGameMode;
                }
            }

            // 5. Check compound identifier with hyphen: "mode-arenaId" where arenaId is 6 alphanumeric chars
            var hyphenIndex = key.LastIndexOf('-');
            if (hyphenIndex > 0 && hyphenIndex < key.Length - 1)
            {
                var potentialArenaId = key.Substring(hyphenIndex + 1);
                if (potentialArenaId.Length == 6)
                {
                    var byCompoundArena = AllWorlds.Values.FirstOrDefault(w => string.Equals(w.ArenaID, potentialArenaId, StringComparison.OrdinalIgnoreCase));
                    if (byCompoundArena != null)
                        return byCompoundArena;

                    var modePrefix = key.Substring(0, hyphenIndex);
                    if (AllWorlds.TryGetValue(modePrefix, out var modeFallback))
                        return modeFallback;

                    var byGameMode = AllWorlds.Values.FirstOrDefault(w => string.Equals(w.GameMode, modePrefix, StringComparison.OrdinalIgnoreCase));
                    if (byGameMode != null)
                        return byGameMode;
                }
            }

            return null;
        }

        public static World FindByArenaID(string arenaId)
        {
            if (string.IsNullOrWhiteSpace(arenaId))
                return null;

            var cleanId = arenaId.Trim();
            if (cleanId.Contains(':'))
                cleanId = cleanId.Split(':')[^1];
            else if (cleanId.Contains('/'))
                cleanId = cleanId.Split('/')[^1];

            return AllWorlds.Values.FirstOrDefault(w => string.Equals(w.ArenaID, cleanId, StringComparison.OrdinalIgnoreCase));
        }

        public static World Find(string world = null)
        {
            if (world != null)
            {
                var exact = FindExact(world);
                if (exact != null)
                    return exact;
            }

            return Default;
        }
    }
}

