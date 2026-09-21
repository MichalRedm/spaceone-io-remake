namespace Game.Robots.Strategies
{
    using Game.Robots.Framework;
    using System;
    using System.Linq;
    using System.Numerics;

    public class CruisingStrategy : IStrategy
    {
        private Vector2 _wanderTarget = Vector2.Zero;
        private long _lastWanderUpdate = 0;
        private bool _isHuntingLeader = false;

        public float EvaluateUtility(HumanoidBot bot)
        {
            // Cruising is the default fallback strategy
            return bot.Parameters.CruisingUtilityBase;
        }

        private Game.Robots.Models.Ship _lockedFishTarget;

        public void Execute(HumanoidBot bot)
        {
            // Find closest food or abandoned ship strictly within safe arena bounds AND on-screen viewport
            float safeFoodLimit = bot.EffectiveWorldSize - 400f;
            
            Game.Robots.Models.Ship closestTarget = null;
            float closestDistSq = float.MaxValue;
            bool lockedStillValid = false;
            float lockedDistSq = float.MaxValue;

            void ProcessTarget(Game.Robots.Models.Ship t)
            {
                // Human players only see and target food/abandoned ships that appear on their screen
                if (bot.IsPointInViewport(t.Position, margin: 60f) 
                    && MathF.Abs(t.Position.X) < safeFoodLimit 
                    && MathF.Abs(t.Position.Y) < safeFoodLimit)
                {
                    float distSq = Vector2.DistanceSquared(t.Position, bot.Position);
                    if (distSq < closestDistSq)
                    {
                        closestDistSq = distSq;
                        closestTarget = t;
                    }
                    if (_lockedFishTarget != null && t.ID == _lockedFishTarget.ID)
                    {
                        lockedStillValid = true;
                        lockedDistSq = distSq;
                    }
                }
            }

            foreach (var t in bot.SensorAbandoned.AllVisibleAbandoned) ProcessTarget(t);
            foreach (var t in bot.SensorFish.AllVisibleFish) ProcessTarget(t);
            
            Game.Robots.Models.Ship target = null;

            if (closestTarget != null)
            {
                if (lockedStillValid)
                {
                    if (closestDistSq < lockedDistSq * 0.5f)
                        _lockedFishTarget = closestTarget;
                }
                else
                {
                    _lockedFishTarget = closestTarget;
                }
                target = _lockedFishTarget;
            }
            else
            {
                _lockedFishTarget = null;
            }

            // DEFENSIVE SHOOTING CHECK (against nearby enemies during cruising)
            var enemies = bot.SensorFleets.Others;
            Game.Robots.Models.Fleet dangerousEnemy = null;
            float minEnemyDistSq = float.MaxValue;
            foreach (var e in enemies)
            {
                if (bot.IsPointInViewport(e.Center, margin: 150f))
                {
                    float distSq = Vector2.DistanceSquared(e.Center, bot.Position);
                    if (distSq < minEnemyDistSq)
                    {
                        minEnemyDistSq = distSq;
                        dangerousEnemy = e;
                    }
                }
            }
            
            bool isAimingAtEnemy = false;
            if (dangerousEnemy != null && Vector2.Distance(dangerousEnemy.Center, bot.Position) < bot.Parameters.SafeDistance * 2)
            {
                if (bot.CanShoot || bot.CooldownShoot <= 0.15f)
                {
                    isAimingAtEnemy = true;
                    var predictedPosition = bot.ComputeHumanAimPoint(dangerousEnemy.Center, dangerousEnemy.Momentum);
                    
                    bot.Cursor.SetTarget(predictedPosition, speed: bot.Parameters.FlickAimSpeed);
                    
                    if (bot.CanShoot && (bot.Cursor.IsAimedAt(predictedPosition, 0.4f) || bot.CooldownShoot <= 0f))
                    {
                        bot.ShootAt(predictedPosition);
                    }
                }
            }

            if (target != null && !isAimingAtEnemy)
            {
                bot.Cursor.SetTarget(bot.ClampToSafePlayableArea(target.Position), speed: bot.Parameters.CruisingSpeed);

                // Shoot at food if our fleet hasn't reached target size, or ALWAYS shoot if it's an abandoned ship.
                // Beginners aim to grow huge swarms (40-60+ ships), while pros stop farming early (12-25 ships) to stay agile.
                int currentFleetSize = bot.SensorFleets.MyFleet?.Ships.Count ?? 0;
                bool isAbandoned = bot.SensorAbandoned.AllVisibleAbandoned.Any(a => a.ID == target.ID);
                
                if (isAbandoned || (currentFleetSize > 0 && currentFleetSize < bot.Parameters.TargetFleetSize))
                {
                    if (bot.CanShoot && Vector2.Distance(target.Position, bot.Position) < 1500)
                    {
                        if (bot.Cursor.IsAimedAt(target.Position, 0.25f))
                        {
                            bot.ShootAt(target.Position);
                        }
                    }
                }
            }
            else if (!isAimingAtEnemy)
            {
                // Wander safely or participate in King Hunt (following leader arrow)
                if (bot.IsNearDangerZone())
                {
                    _wanderTarget = Vector2.Zero;
                    _lastWanderUpdate = bot.GameTime;
                    _isHuntingLeader = false;
                }
                else if (bot.GameTime - _lastWanderUpdate > 3500 || _wanderTarget == Vector2.Zero)
                {
                    int currentFleetSize = bot.SensorFleets.MyFleet?.Ships.Count ?? 0;
                    bool canHuntLeader = bot.LeaderPosition.HasValue 
                        && bot.LeaderFleetID.HasValue
                        && bot.LeaderFleetID.Value != bot.FleetID;

                    // Evaluate King Hunt tendency:
                    // Cautious bots avoid leader when small; aggressive/kinghunter bots pursue leader enthusiastically
                    bool shouldHuntLeader = canHuntLeader 
                        && (Random.Shared.NextDouble() < bot.Parameters.LeaderHuntTendency);

                    if (bot.Parameters.Playstyle.Equals("Cautious", StringComparison.OrdinalIgnoreCase) && currentFleetSize < 15)
                    {
                        shouldHuntLeader = false;
                    }

                    if (shouldHuntLeader)
                    {
                        _wanderTarget = bot.ClampToSafePlayableArea(bot.LeaderPosition.Value);
                        _isHuntingLeader = true;
                    }
                    else
                    {
                        // Pick a random target within safe bounds, spreading out nicely
                        float roamLimit = Math.Max(100f, bot.EffectiveWorldSize - bot.Parameters.DangerZoneBuffer - 100f);
                        float rx = (float)(Random.Shared.NextDouble() * 2 - 1) * roamLimit;
                        float ry = (float)(Random.Shared.NextDouble() * 2 - 1) * roamLimit;
                        _wanderTarget = new Vector2(rx, ry);
                        _isHuntingLeader = false;
                    }

                    _lastWanderUpdate = bot.GameTime;
                }

                // If currently hunting leader, keep refreshing target towards the leader's dynamic position
                if (_isHuntingLeader && bot.LeaderPosition.HasValue)
                {
                    _wanderTarget = bot.ClampToSafePlayableArea(bot.LeaderPosition.Value);
                }

                bot.Cursor.SetTarget(bot.ClampToSafePlayableArea(_wanderTarget), speed: bot.Parameters.CruisingSpeed);
            }
        }
    }
}
