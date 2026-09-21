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
        private long _leaderHuntStartTime = 0;
        private long _lastLeaderHuntDecision = 0;

        public float EvaluateUtility(HumanoidBot bot)
        {
            // Cruising is the default fallback strategy
            return bot.Parameters.CruisingUtilityBase;
        }

        private Game.Robots.Models.Ship _lockedFishTarget;

        public void Execute(HumanoidBot bot)
        {
            float safeFoodLimit = bot.EffectiveWorldSize - 400f;
            int currentFleetSize = bot.SensorFleets.MyFleet?.Ships.Count ?? 0;

            // 1. LEADER HUNT / KING HUNT DECISION
            // Check if leader is alive and not us
            bool canHuntLeader = bot.LeaderPosition.HasValue 
                && bot.LeaderFleetID.HasValue
                && bot.LeaderFleetID.Value != bot.FleetID;

            if (!canHuntLeader)
            {
                _isHuntingLeader = false;
            }
            else
            {
                // If currently hunting, persist for 8-12 seconds before re-evaluating
                if (_isHuntingLeader)
                {
                    if (bot.GameTime - _leaderHuntStartTime > 10000)
                    {
                        _isHuntingLeader = false; // Re-evaluate on next cycle
                        _lastLeaderHuntDecision = bot.GameTime;
                    }
                }
                else if (bot.GameTime - _lastLeaderHuntDecision > 3500)
                {
                    _lastLeaderHuntDecision = bot.GameTime;

                    bool shouldHunt = Random.Shared.NextDouble() < bot.Parameters.LeaderHuntTendency;

                    // Cautious bots avoid the leader if their fleet is small
                    if (bot.Parameters.Playstyle.Equals("Cautious", StringComparison.OrdinalIgnoreCase) && currentFleetSize < 16)
                    {
                        shouldHunt = false;
                    }

                    if (shouldHunt)
                    {
                        _isHuntingLeader = true;
                        _leaderHuntStartTime = bot.GameTime;
                    }
                }
            }

            // 2. TARGET SELECTION (Food, Abandoned Ships, or Leader)
            Game.Robots.Models.Ship closestTarget = null;
            float closestDistSq = float.MaxValue;
            bool lockedStillValid = false;
            float lockedDistSq = float.MaxValue;

            Vector2 leaderDir = Vector2.Zero;
            if (_isHuntingLeader && bot.LeaderPosition.HasValue)
            {
                var toLead = bot.LeaderPosition.Value - bot.Position;
                if (toLead.LengthSquared() > 0.001f)
                    leaderDir = Vector2.Normalize(toLead);
            }

            void ProcessTarget(Game.Robots.Models.Ship t, bool isAbandoned)
            {
                if (!bot.IsPointInViewport(t.Position, margin: 60f) 
                    || MathF.Abs(t.Position.X) >= safeFoodLimit 
                    || MathF.Abs(t.Position.Y) >= safeFoodLimit)
                {
                    return;
                }

                // If hunting the leader, only divert for high-value abandoned ships or food directly in our path
                if (_isHuntingLeader && !isAbandoned && leaderDir != Vector2.Zero)
                {
                    var toT = t.Position - bot.Position;
                    float dist = toT.Length();
                    if (dist > 500f) return;
                    
                    // Only consider food within a forward cone (~40 deg) towards the leader
                    if (Vector2.Dot(Vector2.Normalize(toT), leaderDir) < 0.75f)
                        return;
                }

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

            // Always check abandoned ships first (high value)
            foreach (var t in bot.SensorAbandoned.AllVisibleAbandoned) ProcessTarget(t, isAbandoned: true);

            // If we haven't reached target fleet size, also check regular food
            if (currentFleetSize < bot.Parameters.TargetFleetSize)
            {
                foreach (var t in bot.SensorFish.AllVisibleFish) ProcessTarget(t, isAbandoned: false);
            }
            
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

            // 3. DEFENSIVE SHOOTING CHECK (against nearby enemies during cruising)
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
                    
                    if (bot.CanShoot && (bot.Cursor.IsAimedAt(predictedPosition, bot.Parameters.FiringAngleTolerance) || bot.CooldownShoot <= 0f))
                    {
                        bot.ShootAt(predictedPosition);
                    }
                }
            }

            // 4. NAVIGATION & STEERING
            if (isAimingAtEnemy)
            {
                return;
            }

            if (target != null)
            {
                bot.Cursor.SetTarget(bot.ClampToSafePlayableArea(target.Position), speed: bot.Parameters.CruisingSpeed);

                bool isAbandoned = bot.SensorAbandoned.AllVisibleAbandoned.Any(a => a.ID == target.ID);
                if (isAbandoned || (currentFleetSize > 0 && currentFleetSize < bot.Parameters.TargetFleetSize))
                {
                    if (bot.CanShoot && Vector2.Distance(target.Position, bot.Position) < 1500)
                    {
                        if (bot.Cursor.IsAimedAt(target.Position, bot.Parameters.FiringAngleTolerance))
                        {
                            bot.ShootAt(target.Position);
                        }
                    }
                }
            }
            else if (_isHuntingLeader && bot.LeaderPosition.HasValue)
            {
                // Steer decisively towards the leader arrow!
                var leaderTarget = bot.ClampToSafePlayableArea(bot.LeaderPosition.Value);
                bot.Cursor.SetTarget(leaderTarget, speed: bot.Parameters.CruisingSpeed);
            }
            else
            {
                // Wander safely: If near danger zone, immediately steer towards center of arena
                if (bot.IsNearDangerZone())
                {
                    _wanderTarget = Vector2.Zero;
                    _lastWanderUpdate = bot.GameTime;
                }
                else if (bot.GameTime - _lastWanderUpdate > 3500 || _wanderTarget == Vector2.Zero)
                {
                    float roamLimit = Math.Max(100f, bot.EffectiveWorldSize - bot.Parameters.DangerZoneBuffer - 100f);
                    float rx = (float)(Random.Shared.NextDouble() * 2 - 1) * roamLimit;
                    float ry = (float)(Random.Shared.NextDouble() * 2 - 1) * roamLimit;
                    _wanderTarget = new Vector2(rx, ry);
                    _lastWanderUpdate = bot.GameTime;
                }

                bot.Cursor.SetTarget(bot.ClampToSafePlayableArea(_wanderTarget), speed: bot.Parameters.CruisingSpeed);
            }
        }
    }
}
