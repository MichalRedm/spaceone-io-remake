namespace Game.Robots.Strategies
{
    using Game.API.Common;
    using Game.Robots.Framework;
    using System;
    using System.Numerics;

    /// <summary>
    /// Handles arena roaming, food collection, leader-hunting navigation, travel boosting
    /// across quiet sectors, and unified post-boost abandoned-ship cluster reclaiming.
    /// </summary>
    public class CruisingStrategy : IStrategy
    {
        private Vector2 _wanderTarget = Vector2.Zero;
        private long _lastWanderUpdate = 0;

        private bool _isHuntingLeader = false;
        private long _leaderHuntStartTime = 0;
        private long _lastLeaderHuntDecision = 0;

        private long _lastTravelBoostEvalTime = 0;
        private long _lastTravelBoostTime = 0;

        private Game.Robots.Models.Ship _lockedFishTarget;

        public float EvaluateUtility(HumanoidBot bot)
        {
            return bot.Parameters.CruisingUtilityBase;
        }

        public void Execute(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            int currentFleetSize = myFleet?.Ships.Count ?? 0;
            Vector2 myCenter = myFleet?.Center ?? bot.Position;
            Vector2 myMomentum = myFleet?.Momentum ?? Vector2.Zero;
            Vector2 flightDir = myMomentum.LengthSquared() > 1e-4f
                ? Vector2.Normalize(myMomentum)
                : bot.Cursor.CurrentRelativePosition;

            // 1. LEADER HUNT / KING HUNT DECISION
            UpdateLeaderHuntState(bot, currentFleetSize);

            // 2. NAVIGATION TARGET SELECTION (Decoupled from shooting!)
            float safeFoodLimit = bot.EffectiveWorldSize - 400f;
            Vector2 navTarget = SelectNavigationTarget(bot, myCenter, currentFleetSize, safeFoodLimit, out Game.Robots.Models.Ship navFoodTarget);

            // 3. TRAVEL BOOST (Advanced players boost through quiet space to traverse faster)
            TryTravelBoost(bot, myCenter, navTarget, currentFleetSize);

            // 4. UNIFIED SHOOTING VIA AimAndShootController
            // Priority A: Nearby enemy within defensive viewport range
            if (TryShootNearbyEnemy(bot, myCenter, flightDir))
            {
                return;
            }

            // Priority B: Abandoned-ship cluster reclaim (especially post-travel-boost after AbandonBuffer!)
            if (TryShootAbandonedCluster(bot, myFleet, myCenter, flightDir))
            {
                return;
            }

            // Priority C: Forward food target while building up to TargetFleetSize
            if (navFoodTarget != null && currentFleetSize > 0 && currentFleetSize < bot.Parameters.TargetFleetSize)
            {
                float dist = Vector2.Distance(navFoodTarget.Position, myCenter);
                if (dist < 1500f && bot.AimController.TryAimAndShoot(
                    bot,
                    navFoodTarget.Position,
                    navFoodTarget.Momentum,
                    flightDir,
                    usePredictiveLead: true))
                {
                    return;
                }
            }

            // 5. APPLY NAVIGATION STEERING
            bot.Cursor.SetTarget(bot.ClampToSafePlayableArea(navTarget), speed: bot.Parameters.CruisingSpeed);
        }

        private void UpdateLeaderHuntState(HumanoidBot bot, int currentFleetSize)
        {
            bool canHuntLeader = bot.LeaderPosition.HasValue
                && bot.LeaderFleetID.HasValue
                && bot.LeaderFleetID.Value != bot.FleetID;

            if (!canHuntLeader)
            {
                _isHuntingLeader = false;
                return;
            }

            // Re-roll immediately when a 12s hunt window expires (no forced idle gap)
            if (_isHuntingLeader && bot.GameTime - _leaderHuntStartTime > 12000)
            {
                _isHuntingLeader = false;
                _lastLeaderHuntDecision = 0;
            }

            if (!_isHuntingLeader && (_lastLeaderHuntDecision == 0 || bot.GameTime - _lastLeaderHuntDecision > 2500))
            {
                _lastLeaderHuntDecision = bot.GameTime;

                float effectiveTendency = bot.Parameters.LeaderHuntTendency;
                if (bot.Parameters.Playstyle.Equals("Cautious", StringComparison.OrdinalIgnoreCase)
                    || bot.Parameters.Playstyle.Equals("Farmer", StringComparison.OrdinalIgnoreCase))
                {
                    // Smooth readiness ramp instead of hard size gate
                    float readiness = 0.60f + 0.40f * Math.Clamp(currentFleetSize / 12f, 0f, 1f);
                    effectiveTendency *= readiness;
                }

                if (Random.Shared.NextDouble() < effectiveTendency)
                {
                    _isHuntingLeader = true;
                    _leaderHuntStartTime = bot.GameTime;
                }
            }
        }

        private Vector2 SelectNavigationTarget(
            HumanoidBot bot,
            Vector2 myCenter,
            int currentFleetSize,
            float safeFoodLimit,
            out Game.Robots.Models.Ship navFoodTarget)
        {
            navFoodTarget = null;

            bool isBoosting = bot.IsBoostActive;
            Vector2 leaderDir = Vector2.Zero;
            if (_isHuntingLeader && bot.LeaderPosition.HasValue)
            {
                Vector2 toLead = bot.LeaderPosition.Value - myCenter;
                if (toLead.LengthSquared() > 1e-3f)
                {
                    leaderDir = Vector2.Normalize(toLead);
                }
            }

            // Never steer backward toward abandoned ships or side food while actively boosting
            if (!isBoosting)
            {
                Game.Robots.Models.Ship closestTarget = null;
                float closestDistSq = float.MaxValue;
                bool lockedStillValid = false;
                float lockedDistSq = float.MaxValue;

                void ConsiderTarget(Game.Robots.Models.Ship t, bool isAbandoned)
                {
                    if (!bot.IsPointInViewport(t.Position, margin: 60f)
                        || MathF.Abs(t.Position.X) >= safeFoodLimit
                        || MathF.Abs(t.Position.Y) >= safeFoodLimit)
                    {
                        return;
                    }

                    // While hunting leader, only divert slightly for objects cleanly in our forward path
                    if (_isHuntingLeader && leaderDir != Vector2.Zero)
                    {
                        Vector2 toT = t.Position - myCenter;
                        float dist = toT.Length();
                        if (dist > 500f || dist < 1f) return;

                        float minDot = isAbandoned ? 0.55f : 0.72f;
                        if (Vector2.Dot(toT / dist, leaderDir) < minDot)
                            return;
                    }

                    float distSq = Vector2.DistanceSquared(t.Position, myCenter);
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

                var abandoned = bot.SensorAbandoned.AllVisibleAbandoned;
                for (int i = 0; i < abandoned.Count; i++)
                {
                    ConsiderTarget(abandoned[i], isAbandoned: true);
                }

                if (currentFleetSize < bot.Parameters.TargetFleetSize)
                {
                    var fish = bot.SensorFish.AllVisibleFish;
                    for (int i = 0; i < fish.Count; i++)
                    {
                        ConsiderTarget(fish[i], isAbandoned: false);
                    }
                }

                if (closestTarget != null)
                {
                    if (!lockedStillValid || closestDistSq < lockedDistSq * 0.5f)
                    {
                        _lockedFishTarget = closestTarget;
                    }
                    navFoodTarget = _lockedFishTarget;
                }
                else
                {
                    _lockedFishTarget = null;
                }
            }
            else
            {
                _lockedFishTarget = null;
            }

            if (navFoodTarget != null)
            {
                return navFoodTarget.Position;
            }

            if (_isHuntingLeader && bot.LeaderPosition.HasValue)
            {
                return bot.LeaderPosition.Value;
            }

            // Safe random wander, gently biased toward the leader's arena sector
            if (bot.IsNearDangerZone())
            {
                _wanderTarget = Vector2.Zero;
                _lastWanderUpdate = bot.GameTime;
            }
            else if (bot.GameTime - _lastWanderUpdate > 3500 || _wanderTarget == Vector2.Zero)
            {
                float roamLimit = Math.Max(100f, bot.EffectiveWorldSize - bot.Parameters.DangerZoneBuffer - 100f);
                float rx = (float)(Random.Shared.NextDouble() * 2.0 - 1.0) * roamLimit;
                float ry = (float)(Random.Shared.NextDouble() * 2.0 - 1.0) * roamLimit;
                Vector2 rawWander = new Vector2(rx, ry);

                if (bot.LeaderPosition.HasValue)
                {
                    float bias = Math.Clamp(0.38f * bot.Parameters.LeaderHuntTendency, 0f, 0.45f);
                    rawWander = Vector2.Lerp(rawWander, bot.ClampToSafePlayableArea(bot.LeaderPosition.Value), bias);
                }

                _wanderTarget = rawWander;
                _lastWanderUpdate = bot.GameTime;
            }

            return _wanderTarget;
        }

        private void TryTravelBoost(HumanoidBot bot, Vector2 myCenter, Vector2 navTarget, int currentFleetSize)
        {
            if (!bot.CanBoost
                || bot.Parameters.TravelBoostTendency <= 0.02f
                || bot.Parameters.MaxOffAxisShotAngle < 2.6f)
            {
                return;
            }

            if (currentFleetSize < 6 || currentFleetSize > 44)
                return;

            // Ensure weapon is ready or nearly ready so we can shoot back at abandoned ships shortly after boosting
            if (!bot.CanShoot && bot.CooldownShoot < 0.75f)
                return;

            if (bot.GameTime - _lastTravelBoostEvalTime < 450)
                return;
            _lastTravelBoostEvalTime = bot.GameTime;

            float cooldownMs = 5500f - 2900f * bot.Parameters.TravelBoostTendency;
            if (bot.GameTime - _lastTravelBoostTime < cooldownMs)
                return;

            Vector2 toNav = navTarget - myCenter;
            float dist = toNav.Length();
            if (dist < 850f)
                return;

            if (!bot.Cursor.IsAimedAt(navTarget, 0.35f))
                return;

            // Confirm no tracked enemies or visible enemy bullets nearby
            foreach (var enemy in bot.OffScreenTracker.TrackedEnemies)
            {
                if (enemy.Certainty > 0.1f && Vector2.Distance(myCenter, enemy.EstimatedPosition) < 1100f)
                    return;
            }

            var bullets = bot.SensorBullets.VisibleBullets;
            for (int i = 0; i < bullets.Count; i++)
            {
                if (Vector2.Distance(myCenter, bullets[i].Position) < 900f)
                    return;
            }

            Vector2 travelDir = toNav / dist;
            Vector2 projectedLanding = myCenter + travelDir * 700f;
            float safeLimit = Math.Max(150f, bot.EffectiveWorldSize - bot.Parameters.DangerZoneBuffer);
            if (MathF.Abs(projectedLanding.X) >= safeLimit || MathF.Abs(projectedLanding.Y) >= safeLimit)
                return;

            float boostChance = bot.Parameters.TravelBoostTendency * (1.0f - bot.Parameters.BoostHesitancy * 0.85f);
            if (Random.Shared.NextDouble() < boostChance)
            {
                bot.TriggerBoost(travelDir);
                _lastTravelBoostTime = bot.GameTime;
            }
        }

        private static bool TryShootNearbyEnemy(HumanoidBot bot, Vector2 myCenter, Vector2 flightDir)
        {
            var enemies = bot.SensorFleets.Others;
            Game.Robots.Models.Fleet dangerousEnemy = null;
            float minEnemyDistSq = float.MaxValue;
            float maxRange = bot.Parameters.SafeDistance * 2f;
            float maxRangeSq = maxRange * maxRange;

            for (int i = 0; i < enemies.Count; i++)
            {
                var e = enemies[i];
                if (!bot.IsPointInViewport(e.Center, margin: 150f))
                    continue;

                float distSq = Vector2.DistanceSquared(e.Center, myCenter);
                if (distSq < maxRangeSq && distSq < minEnemyDistSq)
                {
                    minEnemyDistSq = distSq;
                    dangerousEnemy = e;
                }
            }

            if (dangerousEnemy == null)
                return false;

            return bot.AimController.TryAimAndShoot(
                bot,
                dangerousEnemy.Center,
                dangerousEnemy.Momentum,
                flightDir,
                usePredictiveLead: true);
        }

        private static bool TryShootAbandonedCluster(
            HumanoidBot bot,
            Game.Robots.Models.Fleet myFleet,
            Vector2 myCenter,
            Vector2 flightDir)
        {
            var abandoned = bot.SensorAbandoned.AllVisibleAbandoned;
            if (abandoned.Count == 0)
                return false;

            // Respect server AbandonBuffer + small margin after our own boost so bullets collide rather than pass through
            long timeSinceBoost = bot.LastBoostTime > 0 ? (bot.GameTime - bot.LastBoostTime) : long.MaxValue;
            if (timeSinceBoost < bot.AbandonBufferMs + 40)
                return false;

            Sprites myAbandonedSprite = myFleet != null
                ? HumanoidBot.GetAbandonedSpriteForShip(myFleet.Sprite)
                : Sprites.ship_gray;
            bool preferOwnAbandoned = timeSinceBoost < 3500;

            Game.Robots.Models.Ship seedShip = null;
            float bestScore = float.MinValue;

            for (int i = 0; i < abandoned.Count; i++)
            {
                var ship = abandoned[i];
                float dist = Vector2.Distance(ship.Position, myCenter);
                if (dist < 70f || dist > 850f)
                    continue;

                float score = 1.0f - (dist / 850f);
                if (preferOwnAbandoned && ship.Sprite == myAbandonedSprite)
                {
                    score += 1.2f;
                }

                // Favor tight clusters where a single volley can hit multiple abandoned ships
                int neighbors = 0;
                for (int j = 0; j < abandoned.Count; j++)
                {
                    if (i != j && Vector2.DistanceSquared(ship.Position, abandoned[j].Position) <= 140f * 140f)
                    {
                        neighbors++;
                    }
                }
                score += MathF.Min(neighbors, 6) * 0.25f;

                if (score > bestScore)
                {
                    bestScore = score;
                    seedShip = ship;
                }
            }

            if (seedShip == null)
                return false;

            // Compute cluster centroid & average drift velocity
            Vector2 clusterPosSum = seedShip.Position;
            Vector2 clusterVelSum = seedShip.Momentum;
            int clusterCount = 1;

            for (int i = 0; i < abandoned.Count; i++)
            {
                var other = abandoned[i];
                if (other.ID != seedShip.ID && Vector2.DistanceSquared(seedShip.Position, other.Position) <= 140f * 140f)
                {
                    clusterPosSum += other.Position;
                    clusterVelSum += other.Momentum;
                    clusterCount++;
                }
            }

            Vector2 clusterPos = clusterPosSum / clusterCount;
            Vector2 clusterVel = clusterVelSum / clusterCount;

            return bot.AimController.TryAimAndShoot(
                bot,
                clusterPos,
                clusterVel,
                flightDir,
                usePredictiveLead: true);
        }
    }
}
