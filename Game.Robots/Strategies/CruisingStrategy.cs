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
            var targets = bot.SensorAbandoned.AllVisibleAbandoned
                .Concat(bot.SensorFish.AllVisibleFish)
                .Where(t => MathF.Abs(t.Position.X) < safeFoodLimit && MathF.Abs(t.Position.Y) < safeFoodLimit)
                .ToList();
            
            Game.Robots.Models.Ship target = null;

            if (targets.Any())
            {
                if (_lockedFishTarget != null && targets.Any(t => t.ID == _lockedFishTarget.ID))
                {
                    // Stick to locked target unless another one is MUCH closer (hysteresis)
                    var currentDist = Vector2.DistanceSquared(_lockedFishTarget.Position, bot.Position);
                    var closest = targets.OrderBy(f => Vector2.DistanceSquared(f.Position, bot.Position)).First();
                    
                    if (Vector2.DistanceSquared(closest.Position, bot.Position) < currentDist * 0.5f)
                        _lockedFishTarget = closest;
                }
                else
                {
                    _lockedFishTarget = targets.OrderBy(f => Vector2.DistanceSquared(f.Position, bot.Position)).FirstOrDefault();
                }

                target = _lockedFishTarget;
            }
            else
            {
                _lockedFishTarget = null;
            }

            if (target != null)
            {
                // DEFENSIVE FLICK SHOOTING: Even when cruising for fish, if an enemy is nearby and we can shoot, snap to them!
                var enemies = bot.SensorFleets.Others;
                var dangerousEnemy = enemies.OrderBy(e => Vector2.DistanceSquared(e.Center, bot.Position)).FirstOrDefault();
                
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
                var dangerousEnemy = enemies.OrderBy(e => Vector2.DistanceSquared(e.Center, bot.Position)).FirstOrDefault();
                
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
