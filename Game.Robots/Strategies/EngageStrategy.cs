namespace Game.Robots.Strategies
{
    using Game.Robots.Framework;
    using System;
    using System.Linq;
    using System.Numerics;

    public class EngageStrategy : IStrategy
    {
        private uint _targetFleetId = 0;

        public float EvaluateUtility(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            if (myFleet == null || myFleet.Ships.Count == 0) return -1f;

            TrackedEnemy bestEnemy = null;
            float maxUtility = -1f;
            float hysteresis = 0.2f * bot.Parameters.EngageUtilityMultiplier;

            // Evaluate both directly visible and tracked off-screen enemies
            foreach (var enemy in bot.OffScreenTracker.TrackedEnemies)
            {
                if (enemy.Certainty <= 0.05f) continue;

                float distance = Vector2.Distance(myFleet.Center, enemy.EstimatedPosition);
                if (distance > 1500f) continue;

                // Unified combat utility scaled by certainty (1.0 = visible, decaying = off-screen)
                float distanceUtility = 1.0f - (distance / 1500f);
                
                float ratio = (float)myFleet.Ships.Count / Math.Max(1, enemy.ShipCount);
                float urgencyBonus = 0f;
                if (ratio < 0.6f) urgencyBonus = 0.2f; // Threat!
                else if (ratio > 1.5f) urgencyBonus = 0.2f; // Prey!

                // King Hunt Bonus: Focus on the leader if hunting
                float leaderBonus = 0f;
                if (bot.LeaderFleetID.HasValue && enemy.FleetID == bot.LeaderFleetID.Value)
                {
                    leaderBonus = 0.35f * bot.Parameters.LeaderHuntTendency;
                }
                
                float utility = (distanceUtility + urgencyBonus + leaderBonus) * bot.Parameters.EngageUtilityMultiplier * enemy.Certainty;

                // Apply target lock hysteresis to prevent rapid switching between equal targets
                if (_targetFleetId != 0 && enemy.FleetID == _targetFleetId)
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
            // (Only for bots that actually notice and dodge bullets!)
            if (bot.Parameters.BulletDodgeSkill > 0.15f)
            {
                var bullets = bot.SensorBullets.VisibleBullets;
                bool hasIncomingBullets = bullets.Any(b => 
                    b.Group?.Owner != myFleet.ID && 
                    Vector2.Distance(b.Position, myFleet.Center) < 800f &&
                    Vector2.Dot(b.Momentum, myFleet.Center - b.Position) > 0);
                
                if (hasIncomingBullets && maxUtility < bot.Parameters.EngageUtilityMultiplier)
                {
                    maxUtility = bot.Parameters.EngageUtilityMultiplier * 1.5f; // Prioritize combat/dodging movement
                    if (bestEnemy == null)
                    {
                        bestEnemy = bot.OffScreenTracker.TrackedEnemies
                            .OrderBy(e => Vector2.Distance(e.EstimatedPosition, myFleet.Center))
                            .FirstOrDefault();
                    }
                }
            }

            _targetFleetId = bestEnemy?.FleetID ?? 0;
            return maxUtility;
        }

        private long _flickStartTime = 0;
        private long _lastShotTime = 0;

        public void Execute(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            if (myFleet == null || myFleet.Ships.Count == 0) return;

            TrackedEnemy target = _targetFleetId != 0 ? bot.OffScreenTracker.Get(_targetFleetId) : null;
            float distance = target != null ? Vector2.Distance(myFleet.Center, target.EstimatedPosition) : float.MaxValue;

            Vector2 predictedPosition = Vector2.Zero;
            if (target != null)
            {
                // Compute human-like aim point (kinematic interception + flight direction bias + aim jitter)
                predictedPosition = bot.ComputeHumanAimPoint(target.EstimatedPosition, target.EstimatedVelocity);
            }

            // 1. OFFENSIVE DASH (KILLER INSTINCT):
            // Only players with offensive dash enabled (intermediate/pro) execute aggressive forward dashes
            bool canOffensiveDash = bot.CanBoost 
                && bot.Parameters.OffensiveDashEnabled
                && myFleet.Ships.Count >= bot.Parameters.MinimumShipsToOffensiveDash;

            if (target != null && canOffensiveDash && target.Certainty > 0.7f && distance > 180f && distance < 950f)
            {
                // Check boost hesitancy
                bool hesitates = bot.Parameters.BoostHesitancy > 0.001f && (Random.Shared.NextDouble() < bot.Parameters.BoostHesitancy);
                if (!hesitates)
                {
                    bool isSmallEnemy = target.ShipCount <= 5;
                    bool hasDecisiveAdvantage = myFleet.Ships.Count >= target.ShipCount * 1.2f;
                    bool isEnemyFleeing = Vector2.Dot(target.EstimatedVelocity, target.EstimatedPosition - myFleet.Center) > 0;

                    // Ensure the dash won't propel us out of the arena into the danger zone
                    var toEnemy = Vector2.Normalize(target.EstimatedPosition - myFleet.Center);
                    var projectedPos = myFleet.Center + toEnemy * 700f;
                    bool isDashSafe = MathF.Abs(projectedPos.X) < bot.EffectiveWorldSize - 350f 
                                   && MathF.Abs(projectedPos.Y) < bot.EffectiveWorldSize - 350f;

                    if (isDashSafe && (isSmallEnemy || hasDecisiveAdvantage || (isEnemyFleeing && myFleet.Ships.Count >= 4)))
                    {
                        bot.Cursor.SetTarget(predictedPosition, speed: bot.Parameters.FlickAimSpeed);
                        if (bot.Cursor.IsAimedAt(predictedPosition, bot.Parameters.FiringAngleTolerance))
                        {
                            bot.Boost();
                        }
                    }
                }
            }

            // 2. AIMING & SHOOTING PHASE:
            // When shot is almost ready (CooldownShoot <= 0.15f) or ready (CanShoot), move mouse onto opponent
            bool isAimingToShoot = target != null && (bot.CanShoot || bot.CooldownShoot <= 0.15f || (bot.GameTime - _lastShotTime < 40));

            if (isAimingToShoot)
            {
                if (_flickStartTime == 0)
                {
                    _flickStartTime = bot.GameTime;
                }

                // Cursor tracking speed (snappy wrist flick for pros, slower tracking for noobs)
                bot.Cursor.SetTarget(predictedPosition, speed: bot.Parameters.FlickAimSpeed);

                long flickDuration = bot.GameTime - _flickStartTime;
                long maxFlickWait = Math.Max(60, (long)(bot.Parameters.ReactionLatencyMs * 0.6f));

                // Fire when crosshair aligns on target (using skill-scaled angle tolerance) or max wait elapsed
                if (bot.CanShoot && (bot.Cursor.IsAimedAt(predictedPosition, bot.Parameters.FiringAngleTolerance) || flickDuration > maxFlickWait))
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
                
                if (target != null)
                {
                    float ratio = (float)myFleet.Ships.Count / Math.Max(1, target.ShipCount);
                    var toEnemy = target.EstimatedPosition - myFleet.Center;
                    if (toEnemy != Vector2.Zero)
                    {
                        var perp = new Vector2(-toEnemy.Y, toEnemy.X); // 90 degree tangent

                        // Compute continuous graduality based on fleet size ratio
                        float radialWeight = Math.Clamp((ratio - 0.8f) * 2.0f, -1.0f, 1.0f); 
                        float tangentialWeight = 1.0f - Math.Abs(radialWeight);
                        
                        // If the enemy is too far away, add a forward bias to get into engagement range
                        if (distance > bot.Parameters.PursuitDistance && radialWeight > -0.5f)
                        {
                            radialWeight = Math.Max(radialWeight, 0.6f);
                            tangentialWeight = 1.0f - Math.Abs(radialWeight);
                        }

                        var radialVec = Vector2.Normalize(toEnemy) * radialWeight;
                        var tangVec = Vector2.Normalize(perp) * tangentialWeight;

                        moveDir = Vector2.Normalize(radialVec + tangVec);
                        
                        // Defensive dash if fleeing from overwhelming threat
                        bool canDefensiveDash = bot.CanBoost
                            && bot.Parameters.DefensiveDashEnabled
                            && myFleet.Ships.Count >= bot.Parameters.MinimumShipsToDefensiveDash;

                        if (ratio < 0.4f && distance < 450f && canDefensiveDash)
                        {
                            bool hesitates = bot.Parameters.BoostHesitancy > 0.001f && (Random.Shared.NextDouble() < bot.Parameters.BoostHesitancy);
                            if (!hesitates)
                            {
                                bot.Cursor.SetTarget(myFleet.Center + moveDir * 600f, speed: bot.Parameters.FlickAimSpeed);
                                if (bot.Cursor.IsAimedAt(myFleet.Center + moveDir * 600f, 0.4f))
                                {
                                    bot.Boost();
                                }
                            }
                        }
                    }
                }

                // 4. BULLET AVOIDANCE INTEGRATION:
                // Only experienced players with BulletDodgeSkill actively evade bullet trajectories.
                // Complete beginners tunnel-vision and fly straight through incoming fire.
                if (bot.Parameters.BulletDodgeSkill > 0.05f)
                {
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
                            if (Vector2.Dot(perpB, -toBullet) < 0) perpB = -perpB;
                            
                            float weight = 1.0f - (dist / 800f);
                            bulletDodge += perpB * (weight * weight * 5.0f);
                            
                            if (dist < 450f) closeBullets++;
                        }
                    }
                    
                    if (bulletDodge != Vector2.Zero)
                    {
                        // Scale evasion influence by player's dodging skill
                        moveDir = Vector2.Normalize(moveDir + bulletDodge * bot.Parameters.BulletDodgeSkill);
                        
                        // Defensive dash if overwhelmed by close bullets
                        bool canDefensiveDash = bot.CanBoost
                            && bot.Parameters.DefensiveDashEnabled
                            && bot.Parameters.BulletDodgeSkill > 0.35f
                            && myFleet.Ships.Count >= bot.Parameters.MinimumShipsToDefensiveDash;

                        if (closeBullets >= 2 && canDefensiveDash)
                        {
                            bool hesitates = bot.Parameters.BoostHesitancy > 0.001f && (Random.Shared.NextDouble() < bot.Parameters.BoostHesitancy);
                            if (!hesitates)
                            {
                                bot.Cursor.SetTarget(myFleet.Center + moveDir * 600f, speed: bot.Parameters.FlickAimSpeed);
                                if (bot.Cursor.IsAimedAt(myFleet.Center + moveDir * 600f, 0.4f))
                                {
                                    bot.Boost();
                                }
                            }
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
