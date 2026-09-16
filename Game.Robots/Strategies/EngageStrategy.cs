namespace Game.Robots.Strategies
{
    using Game.Robots.Framework;
    using System;
    using System.Linq;
    using System.Numerics;

    public class EngageStrategy : IStrategy
    {
        private Game.Robots.Models.Fleet _targetFleet;

        public float EvaluateUtility(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            if (myFleet == null || myFleet.Ships.Count == 0) return -1f;

            var enemies = bot.SensorFleets.Others;
            Game.Robots.Models.Fleet bestEnemy = null;
            float maxUtility = -1f;
            float hysteresis = 0.2f * bot.Parameters.EngageUtilityMultiplier;

            foreach (var enemy in enemies)
            {
                float distance = Vector2.Distance(myFleet.Center, enemy.Center);
                if (distance > 1500f) continue;

                // Unified combat utility: we care about any enemy that is close, regardless of size.
                // At 1500 distance, utility is 0. At 0 distance, utility is EngageUtilityMultiplier.
                float distanceUtility = 1.0f - (distance / 1500f);
                
                // Add a small bonus if the enemy is either very weak (prey) or very strong (threat)
                float ratio = (float)myFleet.Ships.Count / Math.Max(1, enemy.Ships.Count);
                float urgencyBonus = 0f;
                if (ratio < 0.6f) urgencyBonus = 0.2f; // Threat!
                else if (ratio > 1.5f) urgencyBonus = 0.2f; // Prey!
                
                float utility = (distanceUtility + urgencyBonus) * bot.Parameters.EngageUtilityMultiplier;

                // Apply target lock hysteresis to prevent rapid switching between equal targets
                if (_targetFleet != null && enemy.ID == _targetFleet.ID)
                {
                    utility += hysteresis;
                }

                if (utility > maxUtility)
                {
                    maxUtility = utility;
                    bestEnemy = enemy;
                }
            }

            // Also activate EngageStrategy purely for bullet dodging even if no enemies are close
            var bullets = bot.SensorBullets.VisibleBullets;
            bool hasIncomingBullets = bullets.Any(b => 
                b.Group?.Owner != myFleet.ID && 
                Vector2.Distance(b.Position, myFleet.Center) < 800f &&
                Vector2.Dot(b.Momentum, myFleet.Center - b.Position) > 0);
            
            if (hasIncomingBullets && maxUtility < bot.Parameters.EngageUtilityMultiplier)
            {
                maxUtility = bot.Parameters.EngageUtilityMultiplier * 1.5f; // Prioritize combat/dodging movement
                if (bestEnemy == null) bestEnemy = enemies.OrderBy(e => Vector2.Distance(e.Center, myFleet.Center)).FirstOrDefault();
            }

            _targetFleet = bestEnemy;
            return maxUtility;
        }

        private long _flickStartTime = 0;
        private long _lastShotTime = 0;

        public void Execute(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            float distance = _targetFleet != null ? Vector2.Distance(myFleet.Center, _targetFleet.Center) : float.MaxValue;

            Vector2 predictedPosition = Vector2.Zero;
            if (_targetFleet != null)
            {
                // Compute predictive aim point
                var relativeVelocity = _targetFleet.Momentum - myFleet.Momentum; 
                float bulletSpeed = 11f; 
                float timeToTarget = distance / bulletSpeed;
                predictedPosition = _targetFleet.Center + (relativeVelocity * timeToTarget * bot.Parameters.PredictiveAimFactor);
            }

            // 1. OFFENSIVE DASH (KILLER INSTINCT):
            // When enemy has a small fleet (<= 5 ships), we have a decisive advantage (>= 1.2x),
            // or the enemy is actively fleeing, DASH STRAIGHT AT THEM to close the distance and execute!
            bool canOffensiveDash = bot.CanBoost && myFleet.Ships.Count >= bot.Parameters.MinimumShipsToOffensiveDash;
            if (_targetFleet != null && canOffensiveDash && distance > 180f && distance < 950f)
            {
                bool isSmallEnemy = _targetFleet.Ships.Count <= 5;
                bool hasDecisiveAdvantage = myFleet.Ships.Count >= _targetFleet.Ships.Count * 1.2f;
                bool isEnemyFleeing = Vector2.Dot(_targetFleet.Momentum, _targetFleet.Center - myFleet.Center) > 0;

                // Ensure the dash won't propel us out of the arena into the danger zone
                var toEnemy = Vector2.Normalize(_targetFleet.Center - myFleet.Center);
                var projectedPos = myFleet.Center + toEnemy * 700f;
                bool isDashSafe = MathF.Abs(projectedPos.X) < bot.EffectiveWorldSize - 350f 
                               && MathF.Abs(projectedPos.Y) < bot.EffectiveWorldSize - 350f;

                if (isDashSafe && (isSmallEnemy || hasDecisiveAdvantage || (isEnemyFleeing && myFleet.Ships.Count >= 4)))
                {
                    bot.Cursor.SetTarget(predictedPosition, speed: bot.Parameters.FlickAimSpeed);
                    // Wait for the virtual cursor to actually align before boosting!
                    if (bot.Cursor.IsAimedAt(predictedPosition, 0.35f))
                    {
                        bot.Boost();
                    }
                }
            }

            // 2. AIMING & SHOOTING PHASE:
            // When shot is almost ready (CooldownShoot <= 0.15f) or ready (CanShoot), rapidly flick mouse onto opponent!
            bool isAimingToShoot = _targetFleet != null && (bot.CanShoot || bot.CooldownShoot <= 0.15f || (bot.GameTime - _lastShotTime < 40));

            if (isAimingToShoot)
            {
                if (_flickStartTime == 0)
                {
                    _flickStartTime = bot.GameTime;
                }

                // Rapid wrist flick (high speed Lerp) directly onto the enemy
                bot.Cursor.SetTarget(predictedPosition, speed: bot.Parameters.FlickAimSpeed);

                long flickDuration = bot.GameTime - _flickStartTime;

                // Fire the instant crosshair aligns on target or flick has completed
                if (bot.CanShoot && (bot.Cursor.IsAimedAt(predictedPosition, 0.35f) || flickDuration > 75))
                {
                    bot.ShootAt(predictedPosition);
                    _lastShotTime = bot.GameTime;
                }
            }
            else
            {
                // 3. MANEUVER & PURSUIT PHASE:
                _flickStartTime = 0;

                Vector2 moveDir = new Vector2(1, 0);
                
                if (_targetFleet != null)
                {
                    float ratio = (float)myFleet.Ships.Count / Math.Max(1, _targetFleet.Ships.Count);
                    var toEnemy = _targetFleet.Center - myFleet.Center;
                    if (toEnemy != Vector2.Zero)
                    {
                        var perp = new Vector2(-toEnemy.Y, toEnemy.X); // 90 degree tangent

                        // Compute continuous graduality based on fleet size ratio
                        float radialWeight = Math.Clamp((ratio - 0.8f) * 2.0f, -1.0f, 1.0f); 
                        float tangentialWeight = 1.0f - Math.Abs(radialWeight);
                        
                        // If the enemy is too far away, add a slight forward bias to get into engagement range
                        if (distance > bot.Parameters.PursuitDistance && radialWeight > -0.5f)
                        {
                            radialWeight = Math.Max(radialWeight, 0.6f); // increased forward bias
                            tangentialWeight = 1.0f - Math.Abs(radialWeight);
                        }

                        var radialVec = Vector2.Normalize(toEnemy) * radialWeight;
                        var tangVec = Vector2.Normalize(perp) * tangentialWeight;

                        moveDir = Vector2.Normalize(radialVec + tangVec);
                        
                        // Defensive dash if fleeing from overwhelming threat
                        if (ratio < 0.4f && distance < 450f && bot.CanBoost && myFleet.Ships.Count >= bot.Parameters.MinimumShipsToDefensiveDash)
                        {
                            bot.Cursor.SetTarget(myFleet.Center + moveDir * 600f, speed: bot.Parameters.FlickAimSpeed);
                            if (bot.Cursor.IsAimedAt(myFleet.Center + moveDir * 600f, 0.4f))
                            {
                                bot.Boost();
                            }
                        }
                    }
                }

                // 4. BULLET AVOIDANCE INTEGRATION:
                // Blend bullet evasion continuously into the general combat movement
                Vector2 bulletDodge = Vector2.Zero;
                var bullets = bot.SensorBullets.VisibleBullets;
                int closeBullets = 0;
                
                foreach (var b in bullets)
                {
                    if (b.Group?.Owner == myFleet.ID) continue;
                    var toBullet = b.Position - myFleet.Center;
                    float dist = toBullet.Length();
                    
                    if (dist < 800f && Vector2.Dot(b.Momentum, -toBullet) > 0) // Bullet moving towards us
                    {
                        var perpB = Vector2.Normalize(new Vector2(-b.Momentum.Y, b.Momentum.X));
                        // Choose the perpendicular direction that points away from the bullet
                        if (Vector2.Dot(perpB, -toBullet) < 0) perpB = -perpB;
                        
                        float weight = 1.0f - (dist / 800f);
                        bulletDodge += perpB * (weight * weight * 5.0f); // Quadratic weight for close bullets
                        
                        if (dist < 450f) closeBullets++;
                    }
                }
                
                if (bulletDodge != Vector2.Zero)
                {
                    // Blend bullet repulsion into the combat maneuvering vector
                    moveDir = Vector2.Normalize(moveDir + bulletDodge);
                    
                    // Defensive dash if overwhelmed by close bullets
                    if (closeBullets >= 2 && bot.CanBoost && myFleet.Ships.Count >= bot.Parameters.MinimumShipsToDefensiveDash)
                    {
                        bot.Cursor.SetTarget(myFleet.Center + moveDir * 600f, speed: bot.Parameters.FlickAimSpeed);
                        if (bot.Cursor.IsAimedAt(myFleet.Center + moveDir * 600f, 0.4f))
                        {
                            bot.Boost();
                        }
                    }
                }

                // Blend with danger zone repulsion so we never maneuver out of bounds
                Vector2 repulsion = bot.GetDangerZoneRepulsion();
                if (repulsion != Vector2.Zero)
                {
                    moveDir = Vector2.Normalize(moveDir * 0.5f + Vector2.Normalize(repulsion) * 1.0f);
                }

                var moveTarget = bot.ClampToSafePlayableArea(myFleet.Center + moveDir * 600f);
                bot.Cursor.SetTarget(moveTarget, speed: bot.Parameters.CruisingSpeed);
            }
        }
    }
}
