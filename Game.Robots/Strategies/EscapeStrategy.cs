namespace Game.Robots.Strategies
{
    using Game.Robots.Framework;
    using System.Linq;
    using System.Numerics;

    public class EscapeStrategy : IStrategy
    {
        private Vector2 _threatCentroid;
        private Vector2 _lockedThreatCentroid;
        private Vector2 _lockedEscapeVector;
        private bool _isEscaping = false;
        private bool _isDodgingBullets = false;
        private long _escapeStartTime = 0;
        private int _escapePhase = 0; // 0 = steering away, 1 = boosting, 2 = turning back to shoot, 3 = shooting

        private int _threatFleetSize = 0;
        private float _threatDistance = 0;

        public float EvaluateUtility(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            if (myFleet == null || myFleet.Ships.Count == 0) return -1f;

            var enemies = bot.SensorFleets.Others;
            var bullets = bot.SensorBullets.VisibleBullets;

            float utility = -1f;
            _threatCentroid = Vector2.Zero;
            _threatFleetSize = 0;
            _threatDistance = float.MaxValue;
            int threatCount = 0;
            bool dodging = false;

            // 1. Evaluate threat from incoming bullets (dodging)
            var incomingBullets = bullets.Where(b => 
                b.Group?.Owner != myFleet.ID && 
                Vector2.Distance(b.Position, myFleet.Center) < 800f &&
                Vector2.Dot(b.Momentum, myFleet.Center - b.Position) > 0 // Bullet is moving towards us
            ).ToList();

            if (incomingBullets.Count >= 1)
            {
                // Force a massive utility (e.g., 5.0) so bullet dodging ALWAYS overrides EngageStrategy and CruisingStrategy.
                float bulletUtility = 5.0f * bot.Parameters.EscapeUtilityMultiplier;
                if (bulletUtility > utility) 
                {
                    utility = bulletUtility;
                    _threatDistance = incomingBullets.Average(b => Vector2.Distance(b.Position, myFleet.Center));
                    
                    // Trick the execution logic into thinking there's a massive fleet so it performs a defensive dash
                    // Only trigger the defensive dash trick if there are several bullets, otherwise just sidestep
                    _threatFleetSize = incomingBullets.Count >= 3 ? myFleet.Ships.Count * 3 : 0; 
                    dodging = true;
                }

                foreach (var b in incomingBullets)
                {
                    _threatCentroid += b.Position;
                    threatCount++;
                }
            }

            if (threatCount > 0)
            {
                _threatCentroid /= threatCount;
            }

            // Lock in escape for a brief moment if we started it
            if (_isEscaping && bot.GameTime - _escapeStartTime < 600)
            {
                return bot.Parameters.EscapeUtilityMultiplier * 1.1f;
            }

            if (utility < 0)
            {
                _isEscaping = false;
                _isDodgingBullets = false;
            }
            else if (!_isEscaping)
            {
                _isDodgingBullets = dodging;
            }

            return utility;
        }

        public void Execute(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            if (myFleet == null) return;

            if (!_isEscaping)
            {
                _isEscaping = true;
                _escapeStartTime = bot.GameTime;

                _lockedThreatCentroid = _threatCentroid;
                
                Vector2 rawAway;
                if (_lockedThreatCentroid != myFleet.Center)
                {
                    var awayVector = Vector2.Normalize(myFleet.Center - _lockedThreatCentroid);
                    if (_isDodgingBullets)
                    {
                        // Sidestep the bullets by moving perpendicular to the threat direction
                        rawAway = new Vector2(-awayVector.Y, awayVector.X);
                    }
                    else
                    {
                        rawAway = awayVector;
                    }
                }
                else
                {
                    rawAway = new Vector2(1, 0);
                }

                // Blend with boundary repulsion so escape vector NEVER heads into danger zone
                Vector2 repulsion = bot.GetDangerZoneRepulsion();
                if (repulsion != Vector2.Zero)
                {
                    // Strongly bias towards safe zone / arena center
                    rawAway = Vector2.Normalize(rawAway * 0.4f + Vector2.Normalize(repulsion) * 1.2f);
                }

                _lockedEscapeVector = rawAway * 1000f;
            }

            long elapsed = bot.GameTime - _escapeStartTime;
            var escapeTarget = bot.ClampToSafePlayableArea(myFleet.Center + _lockedEscapeVector);

            // Escape maneuver: Steer safely away
            bool shouldBoost = bot.CanBoost 
                && myFleet.Ships.Count >= 3 
                && _threatDistance < 450f 
                && _threatFleetSize >= myFleet.Ships.Count * 1.5f;

            if (shouldBoost && elapsed > 100 && elapsed < 300)
            {
                // Wait for the virtual cursor to actually align before boosting!
                if (bot.Cursor.IsAimedAt(escapeTarget, 0.4f) || elapsed > 250)
                {
                    bot.Boost();
                }
            }

            // FLICK AIM & SHOOT: When shot is almost ready, turn back and fire at pursuer!
            bool isAimingToShoot = bot.CanShoot || bot.CooldownShoot <= 0.15f;
            
            if (isAimingToShoot)
            {
                // Flick cursor back to shoot pursuer
                bot.Cursor.SetTarget(_lockedThreatCentroid, speed: bot.Parameters.FlickAimSpeed);
                if (bot.CanShoot && (bot.Cursor.IsAimedAt(_lockedThreatCentroid, 0.4f) || bot.CooldownShoot <= 0f)) 
                {
                    bot.ShootAt(_lockedThreatCentroid);
                }
            }
            else
            {
                // Resume safe movement away from pursuer
                bot.Cursor.SetTarget(escapeTarget, speed: bot.Parameters.CruisingSpeed);
            }
            
            if (elapsed > 700)
            {
                _isEscaping = false;
            }
        }
    }
}
