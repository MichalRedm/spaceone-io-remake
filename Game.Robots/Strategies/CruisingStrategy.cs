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

        public float EvaluateUtility(HumanoidBot bot)
        {
            // Cruising is the default fallback strategy
            return bot.Parameters.CruisingUtilityBase;
        }

        private Game.Robots.Models.Ship _lockedFishTarget;

        public void Execute(HumanoidBot bot)
        {
            // Find closest food or abandoned ship strictly within safe arena bounds
            float safeFoodLimit = bot.EffectiveWorldSize - 400f;
            
            Game.Robots.Models.Ship closestTarget = null;
            float closestDistSq = float.MaxValue;
            bool lockedStillValid = false;
            float lockedDistSq = float.MaxValue;

            void ProcessTarget(Game.Robots.Models.Ship t)
            {
                if (MathF.Abs(t.Position.X) < safeFoodLimit && MathF.Abs(t.Position.Y) < safeFoodLimit)
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

            if (target != null)
            {
                // DEFENSIVE FLICK SHOOTING
                var enemies = bot.SensorFleets.Others;
                Game.Robots.Models.Fleet dangerousEnemy = null;
                float minEnemyDistSq = float.MaxValue;
                foreach (var e in enemies)
                {
                    float distSq = Vector2.DistanceSquared(e.Center, bot.Position);
                    if (distSq < minEnemyDistSq)
                    {
                        minEnemyDistSq = distSq;
                        dangerousEnemy = e;
                    }
                }
                
                bool isAimingAtEnemy = false;
                if (dangerousEnemy != null && Vector2.Distance(dangerousEnemy.Center, bot.Position) < bot.Parameters.SafeDistance * 2)
                {
                    if (bot.CanShoot || bot.CooldownShoot <= 0.15f)
                    {
                        isAimingAtEnemy = true;
                        var relativeVelocity = dangerousEnemy.Momentum - (bot.SensorFleets.MyFleet?.Momentum ?? Vector2.Zero);
                        float distanceToEnemy = Vector2.Distance(dangerousEnemy.Center, bot.Position);
                        var predictedPosition = dangerousEnemy.Center + (relativeVelocity * (distanceToEnemy / 11f) * bot.Parameters.PredictiveAimFactor);
                        
                        bot.Cursor.SetTarget(predictedPosition, speed: bot.Parameters.FlickAimSpeed);
                        
                        if (bot.CanShoot && (bot.Cursor.IsAimedAt(predictedPosition, 0.4f) || bot.CooldownShoot <= 0f))
                        {
                            bot.ShootAt(predictedPosition);
                        }
                    }
                }

                if (!isAimingAtEnemy)
                {
                    bot.Cursor.SetTarget(bot.ClampToSafePlayableArea(target.Position), speed: bot.Parameters.CruisingSpeed);

                    // Shoot at food if our fleet is too small, or ALWAYS shoot if it's an abandoned ship (huge value)
                    int currentFleetSize = bot.SensorFleets.MyFleet?.Ships.Count ?? 0;
                    bool isAbandoned = bot.SensorAbandoned.AllVisibleAbandoned.Any(a => a.ID == target.ID);
                    
                    if (isAbandoned || (currentFleetSize > 0 && currentFleetSize < bot.Parameters.TargetFleetSize))
                    {
                        if (bot.CanShoot && Vector2.Distance(target.Position, bot.Position) < 1500)
                        {
                            // Wait until the cursor actually aligns with the target before pulling the trigger
                            if (bot.Cursor.IsAimedAt(target.Position, 0.25f))
                            {
                                bot.ShootAt(target.Position);
                            }
                        }
                    }
                }
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
                    // Pick a random target within safe bounds, spreading out nicely
                    float roamLimit = Math.Max(100f, bot.EffectiveWorldSize - bot.Parameters.DangerZoneBuffer - 100f);
                    float rx = (float)(Random.Shared.NextDouble() * 2 - 1) * roamLimit;
                    float ry = (float)(Random.Shared.NextDouble() * 2 - 1) * roamLimit;
                    _wanderTarget = new Vector2(rx, ry);
                    _lastWanderUpdate = bot.GameTime;
                }

                // DEFENSIVE FLICK SHOOTING (while wandering)
                var enemies = bot.SensorFleets.Others;
                Game.Robots.Models.Fleet dangerousEnemy = null;
                float minEnemyDistSq = float.MaxValue;
                foreach (var e in enemies)
                {
                    float distSq = Vector2.DistanceSquared(e.Center, bot.Position);
                    if (distSq < minEnemyDistSq)
                    {
                        minEnemyDistSq = distSq;
                        dangerousEnemy = e;
                    }
                }
                
                bool isAimingAtEnemy = false;
                if (dangerousEnemy != null && Vector2.Distance(dangerousEnemy.Center, bot.Position) < bot.Parameters.SafeDistance * 2)
                {
                    if (bot.CanShoot || bot.CooldownShoot <= 0.15f)
                    {
                        isAimingAtEnemy = true;
                        var relativeVelocity = dangerousEnemy.Momentum - (bot.SensorFleets.MyFleet?.Momentum ?? Vector2.Zero);
                        float distanceToEnemy = Vector2.Distance(dangerousEnemy.Center, bot.Position);
                        var predictedPosition = dangerousEnemy.Center + (relativeVelocity * (distanceToEnemy / 11f) * bot.Parameters.PredictiveAimFactor);
                        
                        bot.Cursor.SetTarget(predictedPosition, speed: bot.Parameters.FlickAimSpeed);
                        
                        if (bot.CanShoot && (bot.Cursor.IsAimedAt(predictedPosition, 0.4f) || bot.CooldownShoot <= 0f))
                        {
                            bot.ShootAt(predictedPosition);
                        }
                    }
                }

                if (!isAimingAtEnemy)
                {
                    bot.Cursor.SetTarget(bot.ClampToSafePlayableArea(_wanderTarget), speed: bot.Parameters.CruisingSpeed);
                }
            }
        }
    }
}
