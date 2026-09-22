namespace Game.Robots.Strategies
{
    using Game.Robots.Framework;
    using System;
    using System.Linq;
    using System.Numerics;

    public class EscapeStrategy : IStrategy
    {
        private uint _threatFleetId = 0;
        private bool _isEscaping = false;
        private long _escapeStartTime = 0;
        private long _lastEscapeDashTime = 0;
        private long _lastKitingShotTime = 0;
        private long _kitingStartTime = 0;

        public float EvaluateUtility(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            if (myFleet == null || myFleet.Ships.Count == 0) return -1f;

            TrackedEnemy primaryThreat = null;
            float maxThreatScore = -1f;

            // Search for decisive, overwhelming threats
            foreach (var enemy in bot.OffScreenTracker.TrackedEnemies)
            {
                if (enemy.Certainty <= 0.05f) continue;

                float distance = Vector2.Distance(myFleet.Center, enemy.EstimatedPosition);
                if (distance > 1000f) continue;

                float ratio = (float)myFleet.Ships.Count / Math.Max(1, enemy.ShipCount);

                // Check if the enemy is overwhelmingly stronger than our playstyle retreat threshold
                if (ratio < bot.Parameters.RetreatThreshold)
                {
                    float ratioDeficit = (bot.Parameters.RetreatThreshold - ratio) / bot.Parameters.RetreatThreshold;
                    float distanceFactor = 1.0f - (distance / 1000f);
                    float threatScore = (ratioDeficit * 1.5f + distanceFactor * 1.5f) * enemy.Certainty;

                    // Critical health bonus: if fleet has <= 4 ships and enemy has >= 10, maximum escape urgency!
                    if (myFleet.Ships.Count <= 4 && enemy.ShipCount >= 10)
                    {
                        threatScore += 1.0f;
                    }

                    if (threatScore > maxThreatScore)
                    {
                        maxThreatScore = threatScore;
                        primaryThreat = enemy;
                    }
                }
            }

            if (primaryThreat == null)
            {
                _isEscaping = false;
                _threatFleetId = 0;
                return -1f;
            }

            _threatFleetId = primaryThreat.FleetID;

            float utility = maxThreatScore * bot.Parameters.EscapeUtilityMultiplier;

            // Strategy lock-in hysteresis: maintain escape until distance opens up or threat is gone
            if (_isEscaping && bot.GameTime - _escapeStartTime < 800)
            {
                utility += 0.35f * bot.Parameters.EscapeUtilityMultiplier;
            }

            return utility;
        }

        public void Execute(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            if (myFleet == null || myFleet.Ships.Count == 0) return;

            TrackedEnemy threat = _threatFleetId != 0 ? bot.OffScreenTracker.Get(_threatFleetId) : null;
            // If the locked threat is gone or far, find the closest active threat
            if (threat == null || Vector2.Distance(myFleet.Center, threat.EstimatedPosition) > 1200f)
            {
                threat = bot.OffScreenTracker.TrackedEnemies
                    .Where(e => e.Certainty > 0.1f && Vector2.Distance(myFleet.Center, e.EstimatedPosition) < 1000f)
                    .OrderBy(e => Vector2.Distance(myFleet.Center, e.EstimatedPosition))
                    .FirstOrDefault();
            }

            if (threat == null)
            {
                _isEscaping = false;
                return;
            }

            if (!_isEscaping)
            {
                _isEscaping = true;
                _escapeStartTime = bot.GameTime;
            }

            float distance = Vector2.Distance(myFleet.Center, threat.EstimatedPosition);
            var toThreat = threat.EstimatedPosition - myFleet.Center;
            Vector2 awayFromThreat = toThreat != Vector2.Zero ? -Vector2.Normalize(toThreat) : new Vector2(1, 0);

            // Blend with boundary repulsion so escape vector NEVER heads into danger zone
            Vector2 repulsion = bot.GetDangerZoneRepulsion();
            Vector2 escapeHeading;
            if (repulsion != Vector2.Zero)
            {
                // Strongly steer towards arena center / safe area away from wall
                escapeHeading = Vector2.Normalize(awayFromThreat * 0.4f + Vector2.Normalize(repulsion) * 1.4f);
            }
            else
            {
                escapeHeading = awayFromThreat;
            }

            var escapeTarget = bot.ClampToSafePlayableArea(myFleet.Center + escapeHeading * 800f);

            // 1. DEFENSIVE ESCAPE BOOST:
            // When in critical danger (distance < 700f), boost away to open up a gap!
            // Minimum ships for emergency escape is 3 (engine minimum to boost).
            bool canEscapeBoost = bot.CanBoost 
                && bot.Parameters.DefensiveDashEnabled
                && myFleet.Ships.Count >= 3
                && distance < 700f
                && (bot.GameTime - _lastEscapeDashTime > 1500);

            if (canEscapeBoost)
            {
                bool hesitates = bot.Parameters.BoostHesitancy > 0.001f && (Random.Shared.NextDouble() < bot.Parameters.BoostHesitancy);
                if (!hesitates)
                {
                    bot.Cursor.SetTarget(escapeTarget, speed: bot.Parameters.FlickAimSpeed);
                    if (bot.Cursor.IsAimedAt(escapeTarget, 0.40f) || (bot.GameTime - _escapeStartTime > 200))
                    {
                        bot.Boost();
                        _lastEscapeDashTime = bot.GameTime;
                    }
                }
            }

            // 2. RETALIATION / KITING (Shooting back at pursuer for advanced players):
            // Players with SkillLevel >= 0.35 cleanly flick back to fire at pursuers when weapon is ready,
            // exactly like regular aiming in EngageStrategy:
            // - Enter aiming phase when shot is ready or almost ready (CooldownShoot <= 0.15f)
            // - Track kinematic intercept point at FlickAimSpeed
            // - Wait for crosshair to fully align (using FiringAngleTolerance) before pulling the trigger
            // - Once fired, immediately resume escape steering
            bool isAdvanced = bot.Parameters.SkillLevel >= 0.35f;
            bool isPursuerThreatening = threat != null && distance < 850f;

            bool isAimingToShootPursuer = isAdvanced
                && isPursuerThreatening
                && (bot.CanShoot || bot.CooldownShoot <= 0.15f || (bot.GameTime - _lastKitingShotTime < 40))
                && (bot.GameTime - _lastEscapeDashTime > 250)
                && (bot.GameTime - _lastKitingShotTime > 450 || _kitingStartTime > 0);

            if (isAimingToShootPursuer)
            {
                if (_kitingStartTime == 0)
                {
                    _kitingStartTime = bot.GameTime;
                }

                // Continuously track predicted intercept position
                Vector2 aimPoint = bot.ComputeHumanAimPoint(threat.EstimatedPosition, threat.EstimatedVelocity);

                // Flick cursor onto opponent
                bot.Cursor.SetTarget(aimPoint, speed: bot.Parameters.FlickAimSpeed);

                long flickDuration = bot.GameTime - _kitingStartTime;
                long maxFlickWait = Math.Max(280, (long)(bot.Parameters.ReactionLatencyMs * 1.5f));

                // Only fire when crosshair actually aligns on target (using skill-scaled angle tolerance)
                if (bot.CanShoot && bot.Cursor.IsAimedAt(aimPoint, bot.Parameters.FiringAngleTolerance))
                {
                    bot.ShootAt(aimPoint);
                    _lastKitingShotTime = bot.GameTime;
                    _kitingStartTime = 0;
                }
                else if (flickDuration > maxFlickWait)
                {
                    // If alignment could not be achieved in time, abort kiting shot and resume escape
                    _lastKitingShotTime = bot.GameTime;
                    _kitingStartTime = 0;
                }
            }
            else
            {
                _kitingStartTime = 0;

                // 3. HARVESTING FOOD / STARS ON THE RUN:
                // Advanced players (SkillLevel >= 0.30) do not ignore food/stars in front of them while escaping.
                // Shooting food ahead regenerates fleet mass and boost fuel while maintaining escape momentum!
                bool isAimingAtFood = false;
                if (isAdvanced && bot.CanShoot && (bot.GameTime - _lastKitingShotTime > 250))
                {
                    // Look for nearby abandoned ships (highest value) or food in the forward escape cone
                    Game.Robots.Models.Ship foodTarget = null;
                    float bestScore = float.MinValue;

                    void CheckTarget(Game.Robots.Models.Ship item, bool isAbandoned)
                    {
                        var toItem = item.Position - myFleet.Center;
                        float itemDist = toItem.Length();
                        if (itemDist > 550f || itemDist < 10f) return;

                        float dot = Vector2.Dot(toItem / itemDist, escapeHeading);
                        // Must be in the forward escape direction (~65 deg cone)
                        if (dot > 0.40f)
                        {
                            float score = dot * 2.0f + (1.0f - itemDist / 550f) + (isAbandoned ? 3.0f : 0f);
                            if (score > bestScore)
                            {
                                bestScore = score;
                                foodTarget = item;
                            }
                        }
                    }

                    foreach (var a in bot.SensorAbandoned.AllVisibleAbandoned) CheckTarget(a, true);
                    foreach (var f in bot.SensorFish.AllVisibleFish) CheckTarget(f, false);

                    if (foodTarget != null)
                    {
                        var toTarget = foodTarget.Position - myFleet.Center;
                        float dot = Vector2.Dot(Vector2.Normalize(toTarget), escapeHeading);

                        // If food is nearly straight ahead (dot > 0.75), shoot immediately without diverting cursor
                        if (dot > 0.75f)
                        {
                            bot.ShootAt(foodTarget.Position);
                        }
                        else if (distance > 400f) // Quick-aim and shoot food if not in point-blank peril
                        {
                            isAimingAtFood = true;
                            bot.Cursor.SetTarget(foodTarget.Position, speed: bot.Parameters.FlickAimSpeed);
                            if (bot.Cursor.IsAimedAt(foodTarget.Position, bot.Parameters.FiringAngleTolerance + 0.10f))
                            {
                                bot.ShootAt(foodTarget.Position);
                            }
                        }
                    }
                }

                if (!isAimingAtFood)
                {
                    // Normal escape steering: fly at full cruising speed away from threat along safe escape heading
                    bot.Cursor.SetTarget(escapeTarget, speed: bot.Parameters.CruisingSpeed);
                }
            }
        }
    }
}
