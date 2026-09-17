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
                AddWorld("bothell", BotHell());
            }
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
            hook.Description = "Classic free-for-all space combat. Destroy enemy fleets, collect stars, and dominate the leaderboard.";
            hook.Instructions = null;
            hook.Weight = 10;
            hook.WorldSize = 5500;
            hook.Food = (int)System.Math.Round(4.0 * hook.WorldSize * hook.WorldSize / 1000000.0 * hook.FoodDensity);

            return new World(hook, GameConfiguration);
        }

        private static World BotHell()
        {
            var hook = Hook.Default;
            hook.Name = "Bot Hell";
            hook.Description = "Battle against adaptive AI combat drones. Ideal for practicing aim, fleet steering, and dash mechanics.";
            hook.Instructions = null;
            hook.WorldSize = (int)(1125);
            hook.Food = (int)System.Math.Round(4.0 * hook.WorldSize * hook.WorldSize / 1000000.0 * hook.FoodDensity);
            hook.Obstacles = 0;
            hook.AllowedColors = Hook.AllColors;
            hook.Weight = 100;
            hook.BotBase = 3;
            hook.BotHellMode = true;
            hook.BotHellMinBots = 3;

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        private static World RoboTrainer()
        {
            var hook = Hook.Default;
            hook.Name = "Robo Trainer";
            hook.Description = "An empty world for training.";
            hook.Instructions = null;
            hook.WorldSize = 750;
            hook.Food = (int)System.Math.Round(4.0 * hook.WorldSize * hook.WorldSize / 1000000.0 * hook.FoodDensity);
            hook.Obstacles = 0;
            hook.AllowedColors = Hook.AllColors;
            hook.Weight = 90;
            hook.BotBase = 0;
            hook.BotHellMode = false;
            
            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        private static World WorldDuel()
        {
            var hook = Hook.Default;
            hook.BotBase = 0;
            hook.WorldSize = 750;
            hook.Food = (int)System.Math.Round(4.0 * hook.WorldSize * hook.WorldSize / 1000000.0 * hook.FoodDensity);
            hook.Obstacles = 0;
            hook.PointsPerKillFleet = 1;
            hook.PointsPerKillShip = 0;
            hook.PointsPerUniverseDeath = -1;
            hook.PointsMultiplierDeath = 1.0f;
            hook.Weight = 20;

            hook.Name = "Dueling Room";
            hook.Description = "Intense 1v1 fleet duel. Test your combat reflexes and dogfighting skills in an enclosed arena.";
            hook.Instructions = null;
            hook.AllowedColors = Hook.AllColors;

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        private static World WorldTeam()
        {
            var hook = Hook.Default;
            hook.BotBase = 0;
            hook.WorldSize = 1500;
            hook.Food = (int)System.Math.Round(4.0 * hook.WorldSize * hook.WorldSize / 1000000.0 * hook.FoodDensity);
            hook.Obstacles = 0;
            hook.TeamMode = true;
            hook.Weight = 20;

            hook.Name = "Team";
            hook.Description = "Two teams clash in deep space. Coordinate with teammates (Blue vs. Red) to wipe out the opposition.";
            hook.Instructions = null;
            hook.AllowedColors = Hook.TeamColors;

            hook.WorldResizeEnabled = false;

            return new World(hook, GameConfiguration);
        }

        private static World WorldCTF()
        {
            var hook = Hook.Default;
            hook.BotBase = 0;
            hook.WorldSize = 1500;
            hook.Food = (int)System.Math.Round(4.0 * hook.WorldSize * hook.WorldSize / 1000000.0 * hook.FoodDensity);
            hook.Obstacles = 0;
            hook.CTFMode = true;
            hook.TeamMode = true;
            hook.PointsPerKillFleet = 1;
            hook.PointsPerKillShip = 0;
            hook.PointsPerUniverseDeath = -1;
            hook.PointsMultiplierDeath = 1.0f;
            hook.Weight = 20;
            hook.SpawnLocationMode = "CTF";

            hook.Name = "Capture the Flag";
            hook.Description = "Team-based tactical warfare. Infiltrate the enemy base, steal their flag, and defend your own. First to 5 wins!";
            hook.Instructions = null;

            hook.AllowedColors = Hook.TeamColors;

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

