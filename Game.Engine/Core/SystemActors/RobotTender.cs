namespace Game.Engine.Core.SystemActors
{
    using Game.API.Common;
    using System;
    using System.Collections.Generic;

    public class RobotTender : IActor
    {
        private readonly List<Robot> Robots = new List<Robot>();
        private World World = null; 

        private void AddRobot()
        {
            string color = "";
            Sprites sprite = new Sprites();

            int rInt = Random.Shared.Next(7);
            switch (rInt)
            {
                case 0:
                    color = "red";
                    sprite = Sprites.ship_red;
                    break;
                case 1:
                    color = "orange";
                    sprite = Sprites.ship_orange;
                    break;
                case 2:
                    color = "yellow";
                    sprite = Sprites.ship_yellow;
                    break;
                case 3:
                    color = "green";
                    sprite = Sprites.ship_green;
                    break;
                case 4:
                    color = "cyan";
                    sprite = Sprites.ship_cyan;
                    break;
                case 5:
                    color = "blue";
                    sprite = Sprites.ship_blue;
                    break;
                default:
                    color = "pink";
                    sprite = Sprites.ship_pink;
                    break;
            }

            // Console.WriteLine(rInt + " " + color);

            var bot = new Robot()
            {
                ShipSprite = sprite,
                Name = $"🤖Daudelin #{this.Robots.Count}",
                ControlInput = new ControlInput()
            };

            bot.Init(World);

            bot.Spawn(bot.Name, bot.ShipSprite, color, "");

            this.Robots.Add(bot);
        }

        private long _lastAddBotTime = 0;
        private long _lastRemoveBotTime = 0;

        public void Think()
        {
        }

        public void Init(World world)
        {
            this.World = world;
            this.World.Actors.Add(this);
        }

        public void CreateDestroy()
        {
            if (World == null)
                return;

            int desired = Math.Max(0, World.Hook.BotBase);
            uint currentTime = World.Time;

            // 1. Natural Attrition: Clean up any excess bots that died in combat and have AutoSpawn disabled
            for (int i = Robots.Count - 1; i >= 0; i--)
            {
                var bot = Robots[i];
                if (bot == null || bot.PendingDestruction)
                {
                    Robots.RemoveAt(i);
                    continue;
                }

                // If this bot is beyond the desired count and is currently dead, clean it up naturally without respawning
                if (i >= desired && !bot.IsAlive)
                {
                    Robots.RemoveAt(i);
                    bot.AutoSpawn = false;
                    bot.Destroy();
                }
            }

            // 2. Update AutoSpawn flags on all managed bots
            for (int i = 0; i < Robots.Count; i++)
            {
                var bot = Robots[i];
                if (bot != null)
                {
                    bot.AutoSpawn = (i < desired);
                }
            }

            // 3. Incremental Scaling Up: Add at most 1 bot per step delay to prevent mass burst spawning
            if (Robots.Count < desired)
            {
                int spawnDelay = World.Hook.BotSpawnStepDelay > 0 ? World.Hook.BotSpawnStepDelay : 1200;
                
                // Allow instant addition only on initial spin-up when count is 0
                if (Robots.Count == 0 || currentTime >= _lastAddBotTime + spawnDelay)
                {
                    AddRobot();
                    _lastAddBotTime = currentTime;
                }
            }

            // 4. Phased Retiring for Lingering Excess Alive Bots
            // If the desired count decreased and excess bots survive for a long period without dying in combat,
            // retire at most 1 lingering bot per step delay (selecting the bot furthest from active human players)
            if (Robots.Count > desired)
            {
                int retireDelay = World.Hook.BotRetireStepDelay > 0 ? World.Hook.BotRetireStepDelay : 4000;
                if (currentTime >= _lastRemoveBotTime + retireDelay)
                {
                    int bestIndex = -1;
                    float maxDistSq = -1f;

                    var worldPlayers = Player.GetWorldPlayers(World);

                    for (int i = Robots.Count - 1; i >= desired; i--)
                    {
                        var bot = Robots[i];
                        if (bot == null) continue;

                        if (!bot.IsAlive || bot.Fleet == null)
                        {
                            bestIndex = i;
                            break;
                        }

                        // Calculate minimum distance to any alive human player
                        float minHumanDistSq = float.MaxValue;
                        for (int p = 0; p < worldPlayers.Count; p++)
                        {
                            var human = worldPlayers[p];
                            if (human == null || !human.IsAlive || human.Fleet == null || human is Robot)
                                continue;

                            float distSq = System.Numerics.Vector2.DistanceSquared(bot.Fleet.FleetCenter, human.Fleet.FleetCenter);
                            if (distSq < minHumanDistSq)
                                minHumanDistSq = distSq;
                        }

                        if (minHumanDistSq > maxDistSq)
                        {
                            maxDistSq = minHumanDistSq;
                            bestIndex = i;
                        }
                    }

                    if (bestIndex >= 0 && bestIndex < Robots.Count)
                    {
                        var retiringBot = Robots[bestIndex];
                        Robots.RemoveAt(bestIndex);
                        retiringBot.AutoSpawn = false;
                        retiringBot.Die();
                        retiringBot.Destroy();
                        _lastRemoveBotTime = currentTime;
                    }
                }
            }
        }

        public void Destroy()
        {
            this.World.Actors.Remove(this);
        }
    }
}