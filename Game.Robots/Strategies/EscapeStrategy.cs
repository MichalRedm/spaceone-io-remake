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

            // 2. KITING / PARTING SHOTS (Intermediate/Pro players only):
            // Skilled players (SkillLevel >= 0.50) quickly flick back to fire at pursuers when weapon is ready,
            // then immediately snap back to escaping. Beginners just run forward in a straight line.
            bool canKite = bot.Parameters.SkillLevel >= 0.50f 
                && bot.CanShoot 
                && distance < 750f 
                && (bot.GameTime - _lastEscapeDashTime > 350)
                && (bot.GameTime - _lastKitingShotTime > 500);

            if (canKite)
            {
                Vector2 aimPoint = bot.ComputeHumanAimPoint(threat.EstimatedPosition, threat.EstimatedVelocity);
                bot.Cursor.SetTarget(aimPoint, speed: bot.Parameters.FlickAimSpeed);
                if (bot.Cursor.IsAimedAt(aimPoint, 0.40f))
                {
                    bot.ShootAt(aimPoint);
                    _lastKitingShotTime = bot.GameTime;
                }
            }
            else
            {
                // Normal escape steering: fly at full cruising speed away from threat
                bot.Cursor.SetTarget(escapeTarget, speed: bot.Parameters.CruisingSpeed);
            }
        }
    }
}
