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

        private float _orbitSign = 0f;
        private long _lastOrbitDecisionTime = 0;
        private long _nextBulletScanTime = 0;
        private Vector2 _activeDodgeImpulse = Vector2.Zero;
        private long _activeDodgeStartTime = 0;
        private long _activeDodgeUntil = 0;
        private long _lastDefensiveDashTime = 0;

        public void Execute(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            if (myFleet == null || myFleet.Ships.Count == 0) return;

            if (_orbitSign == 0f)
            {
                _orbitSign = (bot.FleetID % 2 == 0) ? 1.0f : -1.0f;
            }

            TrackedEnemy target = _targetFleetId != 0 ? bot.OffScreenTracker.Get(_targetFleetId) : null;
            float distance = target != null ? Vector2.Distance(myFleet.Center, target.EstimatedPosition) : float.MaxValue;

            Vector2 predictedPosition = Vector2.Zero;
            if (target != null)
            {
                // Compute human-like aim point (kinematic interception for pros, direct at enemy + jitter for noobs)
                predictedPosition = bot.ComputeHumanAimPoint(target.EstimatedPosition, target.EstimatedVelocity);
            }

            // 1. BULLET SCANNING & PERCEPTION CHECK:
            // Humans periodically scan for incoming fire (perception check).
            // Stronger players notice incoming fire with high reliability and react with fast latency and tight angles.
            // Dodge Commitment: do not re-scan or interrupt if already committed to an active dodge maneuver.
            float threateningBulletDist = float.MaxValue;
            bool isCommittedToDodge = bot.GameTime < _activeDodgeUntil;

            if (!isCommittedToDodge && bot.GameTime >= _nextBulletScanTime)
            {
                _nextBulletScanTime = bot.GameTime + 120; // Visual scan interval ~120ms

                var bullets = bot.SensorBullets.VisibleBullets;
                Game.API.Client.Body mostThreateningBullet = null;

                foreach (var b in bullets)
                {
                    if (b.Group?.Owner == myFleet.ID) continue;
                    var toBullet = b.Position - myFleet.Center;
                    float dist = toBullet.Length();

                    if (dist < 800f && Vector2.Dot(b.Momentum, -toBullet) > 0) // Bullet incoming towards fleet
                    {
                        if (dist < threateningBulletDist)
                        {
                            threateningBulletDist = dist;
                            mostThreateningBullet = b;
                        }
                    }
                }

                if (mostThreateningBullet != null)
                {
                    // Probabilistic perception check
                    bool noticed = Random.Shared.NextDouble() < bot.Parameters.BulletDodgeProbability;
                    if (noticed)
                    {
                        var toBullet = mostThreateningBullet.Position - myFleet.Center;
                        var perpB = Vector2.Normalize(new Vector2(-mostThreateningBullet.Momentum.Y, mostThreateningBullet.Momentum.X));

                        // Hysteresis & Momentum Alignment:
                        // If the fleet already has momentum, dodge along existing movement to avoid jarring 180-degree reversals.
                        if (myFleet.Momentum.LengthSquared() > 0.05f)
                        {
                            if (Vector2.Dot(perpB, myFleet.Momentum) < 0)
                            {
                                perpB = -perpB;
                            }
                        }
                        else
                        {
                            // If stationary, break symmetry consistently using cross-track offset
                            if (Vector2.Dot(perpB, -toBullet) < 0)
                            {
                                perpB = -perpB;
                            }
                        }

                        // Apply human angular error in dodge direction
                        if (bot.Parameters.BulletDodgeAngularError > 0.01f)
                        {
                            float errAngle = (float)(Random.Shared.NextDouble() * 2.0 - 1.0) * bot.Parameters.BulletDodgeAngularError;
                            float cos = MathF.Cos(errAngle);
                            float sin = MathF.Sin(errAngle);
                            perpB = new Vector2(perpB.X * cos - perpB.Y * sin, perpB.X * sin + perpB.Y * cos);
                        }

                        // Dodge strength scales up with skill level: 5.5 (noobs) to 9.5 (pros)
                        float dodgeStrength = 5.5f + 4.0f * bot.Parameters.BulletDodgeSkill;
                        float weight = Math.Clamp(1.0f - (threateningBulletDist / 800f), 0.25f, 1.0f);
                        _activeDodgeImpulse = perpB * (weight * weight * dodgeStrength);
                        
                        // Stronger players react much faster:
                        long latency = (long)(bot.Parameters.ReactionLatencyMs * (0.60f - 0.25f * bot.Parameters.SkillLevel));
                        _activeDodgeStartTime = bot.GameTime + Math.Max(35, latency);
                        _activeDodgeUntil = _activeDodgeStartTime + 350; // Committed evasion burst duration (~350ms)
                        _nextBulletScanTime = _activeDodgeUntil + 120; // Refractory period before scanning for next dodge
                    }
                }
            }

            bool isDodging = bot.GameTime >= _activeDodgeStartTime && bot.GameTime < _activeDodgeUntil && _activeDodgeImpulse != Vector2.Zero;

            // 2. DEFENSIVE DASH AGAINST INCOMING FIRE (FLASH DODGE):
            // Stronger players (SkillLevel >= 0.40) execute a quick boost sideways to flash-dodge lethal volleys
            bool canDefensiveDash = bot.CanBoost 
                && bot.Parameters.DefensiveDashEnabled
                && bot.Parameters.SkillLevel >= 0.40f
                && (bot.GameTime - _lastDefensiveDashTime > 1200)
                && myFleet.Ships.Count >= bot.Parameters.MinimumShipsToDefensiveDash;

            if (isDodging && canDefensiveDash && threateningBulletDist < 450f)
            {
                bool hesitates = bot.Parameters.BoostHesitancy > 0.001f && (Random.Shared.NextDouble() < bot.Parameters.BoostHesitancy);
                if (!hesitates)
                {
                    var dodgeVector = Vector2.Normalize(_activeDodgeImpulse);
                    var projectedPos = myFleet.Center + dodgeVector * 650f;
                    bool isDashSafe = MathF.Abs(projectedPos.X) < bot.EffectiveWorldSize - 350f 
                                   && MathF.Abs(projectedPos.Y) < bot.EffectiveWorldSize - 350f;

                    if (isDashSafe)
                    {
                        bot.Cursor.SetTarget(projectedPos, speed: bot.Parameters.FlickAimSpeed);
                        if (bot.Cursor.IsAimedAt(projectedPos, 0.45f))
                        {
                            bot.Boost();
                            _lastDefensiveDashTime = bot.GameTime;
                        }
                    }
                }
            }

            // 3. OFFENSIVE DASH (KILLER INSTINCT):
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

            // 4. AIMING & SHOOTING PHASE:
            // When shot is almost ready (CooldownShoot <= 0.15f) or ready (CanShoot), move mouse onto opponent
            bool isAimingToShoot = target != null && (bot.CanShoot || bot.CooldownShoot <= 0.15f || (bot.GameTime - _lastShotTime < 40));

            if (isAimingToShoot)
            {
                if (_flickStartTime == 0)
                {
                    _flickStartTime = bot.GameTime;
                }

                Vector2 aimTarget = predictedPosition;

                // Cursor tracking speed (snappy wrist flick for pros, slower tracking for noobs)
                bot.Cursor.SetTarget(aimTarget, speed: bot.Parameters.FlickAimSpeed);

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
                // 5. MANEUVER & PURSUIT PHASE:
                _flickStartTime = 0;

                Vector2 moveDir = new Vector2(1, 0);
                
                if (target != null)
                {
                    float ratio = (float)myFleet.Ships.Count / Math.Max(1, target.ShipCount);
                    var toEnemy = target.EstimatedPosition - myFleet.Center;
                    if (toEnemy != Vector2.Zero)
                    {
                        // Symmetry breaking: dynamically select and periodically reverse orbit direction in close combat
                        if (distance < 700f && (bot.GameTime - _lastOrbitDecisionTime > 1800))
                        {
                            _lastOrbitDecisionTime = bot.GameTime;
                            float flipChance = Math.Clamp(0.25f + 0.35f * (1.0f - bot.Parameters.SkillLevel), 0.15f, 0.60f);
                            if (Random.Shared.NextDouble() < flipChance)
                            {
                                _orbitSign = -_orbitSign;
                            }
                        }

                        var perp = new Vector2(-toEnemy.Y * _orbitSign, toEnemy.X * _orbitSign); // Dynamic tangent

                        float radialWeight;
                        float tangentialWeight;

                        if (bot.Parameters.SkillLevel < 0.35f)
                        {
                            // Beginners charge aggressively but with small tangential bias to avoid perfect linear head-ons
                            radialWeight = 0.85f;
                            tangentialWeight = 0.25f;
                        }
                        else
                        {
                            // Intermediate and pro players: tactical spacing and kiting based on fleet ratio
                            float retreatThreshold = Math.Clamp(0.3f + 0.5f * bot.Parameters.SkillLevel, 0.4f, 0.85f);
                            radialWeight = Math.Clamp((ratio - retreatThreshold) * 2.0f, -1.0f, 1.0f);
                            tangentialWeight = 1.0f - Math.Abs(radialWeight);

                            // If the enemy is too far away, add a forward bias to get into engagement range
                            if (distance > bot.Parameters.PursuitDistance && radialWeight > -0.5f)
                            {
                                radialWeight = Math.Max(radialWeight, 0.6f);
                                tangentialWeight = 1.0f - Math.Abs(radialWeight);
                            }
                        }

                        var radialVec = Vector2.Normalize(toEnemy) * radialWeight;
                        var tangVec = Vector2.Normalize(perp) * tangentialWeight;

                        moveDir = Vector2.Normalize(radialVec + tangVec);

                        // Organic steering noise: break smooth consistency and lockstep orbits
                        if (bot.Parameters.SteeringNoiseAmplitude > 0.01f)
                        {
                            float noiseTime = bot.GameTime * 0.003f + (bot.FleetID * 19.17f);
                            float wanderAngle = (MathF.Sin(noiseTime) + MathF.Sin(noiseTime * 2.3f) * 0.5f) * bot.Parameters.SteeringNoiseAmplitude;
                            float cos = MathF.Cos(wanderAngle);
                            float sin = MathF.Sin(wanderAngle);
                            moveDir = new Vector2(moveDir.X * cos - moveDir.Y * sin, moveDir.X * sin + moveDir.Y * cos);
                        }
                        
                        // Defensive dash if fleeing from overwhelming threat (only for intermediate/pro)
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

                // Apply active dodge impulse with smooth sinusoidal bell-curve envelope
                if (isDodging)
                {
                    float duration = Math.Max(1, _activeDodgeUntil - _activeDodgeStartTime);
                    float progress = Math.Clamp((float)(bot.GameTime - _activeDodgeStartTime) / duration, 0f, 1f);
                    float envelope = MathF.Sin(progress * MathF.PI); // Smooth bell curve (0 -> 1 -> 0)
                    moveDir = Vector2.Normalize(moveDir + _activeDodgeImpulse * envelope);
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
