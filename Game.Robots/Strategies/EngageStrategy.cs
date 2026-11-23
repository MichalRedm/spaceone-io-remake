namespace Game.Robots.Strategies
{
    using Game.API.Client;
    using Game.Robots.Framework;
    using System;
    using System.Numerics;

    /// <summary>
    /// Unified combat, kiting, bullet-dodging, multi-threat surround breakout,
    /// and smooth disengagement strategy.
    /// </summary>
    public class EngageStrategy : IStrategy
    {
        private const int RayCount = 16;
        private static readonly Vector2[] BreakoutRays = CreateRays(RayCount);

        private uint _targetFleetId = 0;

        private float _orbitSign = 0f;
        private long _lastOrbitDecisionTime = 0;
        private long _nextBulletScanTime = 0;

        private Vector2 _activeDodgeImpulse = Vector2.Zero;
        private float _activeDodgeThreatDist = float.MaxValue;
        private float _activeDodgeSoonestCpa = float.MaxValue;
        private int _activeDodgeBulletCount = 0;
        private long _activeDodgeStartTime = 0;
        private long _activeDodgeUntil = 0;

        private long _lastDefensiveDashTime = 0;
        private long _lastOffensiveDashTime = 0;
        private long _lastDashEvalTime = 0;
        private long _activeDashUntil = 0;
        private Vector2 _activeDashTarget = Vector2.Zero;

        private struct ThreatAssessment
        {
            public float SingleShipPressure;
            public float SurroundPressure;
            public float RetreatPressure;
            public int NearbyThreatCount;
            public bool HasOverwhelmingThreat;
            public Vector2 SafestBreakoutDir;
        }

        private static Vector2[] CreateRays(int count)
        {
            var rays = new Vector2[count];
            float step = (MathF.PI * 2f) / count;
            for (int i = 0; i < count; i++)
            {
                float angle = i * step;
                rays[i] = new Vector2(MathF.Cos(angle), MathF.Sin(angle));
            }
            return rays;
        }

        public float EvaluateUtility(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            if (myFleet == null || myFleet.Ships.Count == 0) return -1f;

            int myShips = myFleet.Ships.Count;
            TrackedEnemy bestEnemy = null;
            float maxUtility = -1f;
            float hysteresis = 0.2f * bot.Parameters.EngageUtilityMultiplier;
            int nearbyThreatCount = 0;

            foreach (var enemy in bot.OffScreenTracker.TrackedEnemies)
            {
                if (enemy.Certainty <= 0.05f) continue;

                float distance = Vector2.Distance(myFleet.Center, enemy.EstimatedPosition);
                if (distance > 1500f) continue;

                float ratio = (float)myShips / Math.Max(1, enemy.ShipCount);
                if (distance < 950f && ratio < 1.15f)
                {
                    nearbyThreatCount++;
                }

                float distanceUtility = 1.0f - (distance / 1500f);

                float urgencyBonus = 0f;
                if (ratio < 0.7f) urgencyBonus = 0.25f;
                else if (ratio > 1.5f) urgencyBonus = 0.2f;

                if (myShips == 1 && distance < 950f && enemy.ShipCount >= 2)
                {
                    urgencyBonus += 0.45f;
                }

                float leaderBonus = 0f;
                if (bot.LeaderFleetID.HasValue && enemy.FleetID == bot.LeaderFleetID.Value)
                {
                    leaderBonus = 0.35f * bot.Parameters.LeaderHuntTendency;
                }

                float utility = (distanceUtility + urgencyBonus + leaderBonus) * bot.Parameters.EngageUtilityMultiplier * enemy.Certainty;

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

            if (nearbyThreatCount >= 2 && maxUtility > 0f)
            {
                maxUtility += 0.25f * bot.Parameters.EngageUtilityMultiplier;
            }

            // Activate combat/dodging when enemy bullets are inbound even if shooter is not close
            if (bot.Parameters.BulletDodgeSkill > 0.12f)
            {
                var bullets = bot.SensorBullets.VisibleBullets;
                bool hasIncomingBullets = false;
                for (int i = 0; i < bullets.Count; i++)
                {
                    var b = bullets[i];
                    if (b.Group?.Owner != myFleet.ID
                        && Vector2.Distance(b.Position, myFleet.Center) < 800f
                        && Vector2.Dot(b.Momentum, myFleet.Center - b.Position) > 0f)
                    {
                        hasIncomingBullets = true;
                        break;
                    }
                }

                if (hasIncomingBullets && maxUtility < bot.Parameters.EngageUtilityMultiplier)
                {
                    maxUtility = bot.Parameters.EngageUtilityMultiplier * 1.5f;
                    if (bestEnemy == null)
                    {
                        float closestDistSq = float.MaxValue;
                        foreach (var enemy in bot.OffScreenTracker.TrackedEnemies)
                        {
                            float dSq = Vector2.DistanceSquared(enemy.EstimatedPosition, myFleet.Center);
                            if (dSq < closestDistSq)
                            {
                                closestDistSq = dSq;
                                bestEnemy = enemy;
                            }
                        }
                    }
                }
            }

            _targetFleetId = bestEnemy?.FleetID ?? 0;
            return maxUtility;
        }

        public void Execute(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            if (myFleet == null || myFleet.Ships.Count == 0) return;

            if (_orbitSign == 0f)
            {
                _orbitSign = (bot.FleetID % 2 == 0) ? 1.0f : -1.0f;
            }

            int myShips = myFleet.Ships.Count;
            TrackedEnemy target = _targetFleetId != 0 ? bot.OffScreenTracker.Get(_targetFleetId) : null;
            float distance = target != null ? Vector2.Distance(myFleet.Center, target.EstimatedPosition) : float.MaxValue;

            // 1. MULTI-THREAT & SURROUND ASSESSMENT + 16-RAY BREAKOUT CORRIDOR
            ThreatAssessment threats = AssessThreats(bot, myFleet.Center, myFleet.Momentum, myShips);

            // 2. BULLET SCANNING & PERSISTENT PERCEPTION STATE
            ScanIncomingBullets(bot, myFleet.ID, myFleet.Center, myFleet.Momentum, myShips, threats.SafestBreakoutDir);
            bool isDodging = bot.GameTime >= _activeDodgeStartTime
                && bot.GameTime < _activeDodgeUntil
                && _activeDodgeImpulse != Vector2.Zero;

            // 3. UNIFIED MUTUALLY-EXCLUSIVE DASH STATE MACHINE
            bool isDashing = HandleDashes(bot, myFleet.Center, myFleet.Momentum, myShips, target, distance, threats, isDodging);

            // 4. UNIFIED AIMING & SHOOTING (DELEGATED TO AimAndShootController)
            bool isAiming = false;
            Vector2 flightDir = myFleet.Momentum.LengthSquared() > 1e-4f
                ? Vector2.Normalize(myFleet.Momentum)
                : bot.Cursor.CurrentRelativePosition;

            if (!isDashing && target != null)
            {
                isAiming = bot.AimController.TryAimAndShoot(
                    bot,
                    target.EstimatedPosition,
                    target.EstimatedVelocity,
                    flightDir,
                    usePredictiveLead: true);
            }

            // While heavily retreating, opportunistically shoot abandoned ships or food in forward escape cone
            if (!isDashing && !isAiming && threats.RetreatPressure > 0.65f && bot.CanShoot)
            {
                isAiming = TryShootEscapeCorridorFood(bot, myFleet.Center, threats.SafestBreakoutDir, flightDir);
            }

            if (isDashing || isAiming)
            {
                return;
            }

            // 5. CONTINUOUS MANEUVER, KITING & SMOOTH DISENGAGEMENT STEERING
            Vector2 moveDir = Vector2.Zero;

            if (target != null)
            {
                float ratio = (float)myShips / Math.Max(1, target.ShipCount);
                Vector2 toEnemy = target.EstimatedPosition - myFleet.Center;

                if (toEnemy.LengthSquared() > 1e-4f)
                {
                    if (distance < 700f && (bot.GameTime - _lastOrbitDecisionTime > 1800))
                    {
                        _lastOrbitDecisionTime = bot.GameTime;
                        float flipChance = Math.Clamp(0.25f + 0.35f * (1.0f - bot.Parameters.SkillLevel), 0.15f, 0.60f);
                        if (Random.Shared.NextDouble() < flipChance)
                        {
                            _orbitSign = -_orbitSign;
                        }
                    }

                    Vector2 toEnemyDir = Vector2.Normalize(toEnemy);
                    Vector2 perpDir = new Vector2(-toEnemyDir.Y * _orbitSign, toEnemyDir.X * _orbitSign);

                    // Gentle combat spacing: equal/smaller foes fight tightly; against larger foes,
                    // hold moderate orbital spacing to prevent flying head-first into their guns.
                    float aggressiveRadial = 0.80f;
                    float aggressiveTangent = 0.35f;

                    float largerEnemyFactor = SmoothStep(0.95f, 0.35f, ratio);
                    float baseCloseDist = Math.Clamp(bot.Parameters.PursuitDistance * 0.75f, 220f, 340f);
                    float desiredDist = Lerp(baseCloseDist, Math.Clamp(bot.Parameters.SafeDistance * 0.90f, 360f, 520f), largerEnemyFactor);

                    float minRadial = Lerp(-0.20f, -0.45f, largerEnemyFactor);
                    float distError = (distance - desiredDist) / Math.Max(180f, desiredDist * 0.75f);
                    float tacticalRadial = Math.Clamp(distError, minRadial, 0.85f);
                    float tacticalTangent = MathF.Sqrt(Math.Max(0.20f, 1.0f - tacticalRadial * tacticalRadial));

                    float kitingSkill = bot.Parameters.KitingSkill;
                    float radialWeight = aggressiveRadial + (tacticalRadial - aggressiveRadial) * kitingSkill;
                    float tangentialWeight = aggressiveTangent + (tacticalTangent - aggressiveTangent) * kitingSkill;

                    Vector2 combatDir = toEnemyDir * radialWeight + perpDir * tangentialWeight;
                    moveDir = combatDir.LengthSquared() > 1e-5f ? Vector2.Normalize(combatDir) : perpDir;
                }
            }
            else if (threats.SafestBreakoutDir != Vector2.Zero)
            {
                moveDir = threats.SafestBreakoutDir;
            }
            else
            {
                moveDir = new Vector2(1f, 0f);
            }

            // Smoothly blend combat kiting with safest breakout corridor ONLY when down to 1 ship (extreme survival)
            float escapeBlend = SmoothStep(0.30f, 0.90f, threats.RetreatPressure);
            if (escapeBlend > 0.01f && threats.SafestBreakoutDir != Vector2.Zero)
            {
                Vector2 blended = Vector2.Lerp(moveDir, threats.SafestBreakoutDir, escapeBlend);
                if (blended.LengthSquared() > 1e-5f)
                {
                    moveDir = Vector2.Normalize(blended);
                }
            }

            // While fighting a nearby opponent without high retreat pressure, maintain gentle drift toward leader
            if (target != null
                && bot.LeaderPosition.HasValue
                && (!bot.LeaderFleetID.HasValue || target.FleetID != bot.LeaderFleetID.Value)
                && threats.RetreatPressure < 0.35f)
            {
                Vector2 toLeader = bot.LeaderPosition.Value - myFleet.Center;
                float leaderDistSq = toLeader.LengthSquared();
                if (leaderDistSq > 450f * 450f)
                {
                    float leaderDriftWeight = 0.25f * bot.Parameters.LeaderHuntTendency * (1.0f - threats.RetreatPressure);
                    Vector2 drifted = Vector2.Lerp(moveDir, toLeader / MathF.Sqrt(leaderDistSq), leaderDriftWeight);
                    if (drifted.LengthSquared() > 1e-5f)
                    {
                        moveDir = Vector2.Normalize(drifted);
                    }
                }
            }

            // Apply organic steering noise to break lockstep symmetry
            if (bot.Parameters.SteeringNoiseAmplitude > 0.01f && moveDir.LengthSquared() > 1e-5f)
            {
                float noiseTime = bot.GameTime * 0.003f + (bot.FleetID * 19.17f);
                float wanderAngle = (MathF.Sin(noiseTime) + MathF.Sin(noiseTime * 2.3f) * 0.5f) * bot.Parameters.SteeringNoiseAmplitude;
                float cos = MathF.Cos(wanderAngle);
                float sin = MathF.Sin(wanderAngle);
                moveDir = new Vector2(moveDir.X * cos - moveDir.Y * sin, moveDir.X * sin + moveDir.Y * cos);
            }

            // Apply active bullet dodge impulse with front-loaded evasion curve for crisp initial reaction
            if (isDodging)
            {
                float duration = Math.Max(1f, _activeDodgeUntil - _activeDodgeStartTime);
                float progress = Math.Clamp((float)(bot.GameTime - _activeDodgeStartTime) / duration, 0f, 1f);
                float envelope = MathF.Pow(1.0f - progress, 0.55f);
                Vector2 dodged = moveDir + _activeDodgeImpulse * envelope;
                if (dodged.LengthSquared() > 1e-5f)
                {
                    moveDir = Vector2.Normalize(dodged);
                }
            }

            // Blend with arena danger zone repulsion
            Vector2 repulsion = bot.GetDangerZoneRepulsion();
            if (repulsion.LengthSquared() > 1e-6f)
            {
                Vector2 repulsed = moveDir * 0.5f + Vector2.Normalize(repulsion) * 1.0f;
                if (repulsed.LengthSquared() > 1e-5f)
                {
                    moveDir = Vector2.Normalize(repulsed);
                }
            }

            if (moveDir.LengthSquared() < 1e-5f || !float.IsFinite(moveDir.X) || !float.IsFinite(moveDir.Y))
            {
                moveDir = new Vector2(1f, 0f);
            }

            var moveTarget = bot.ClampToSafePlayableArea(myFleet.Center + moveDir * 600f);
            float steerSpeed = isDodging
                ? MathF.Max(bot.Parameters.CruisingSpeed, bot.Parameters.FlickAimSpeed * (0.45f + 0.40f * bot.Parameters.BulletDodgeSkill))
                : bot.Parameters.CruisingSpeed;
            bot.Cursor.SetTarget(moveTarget, speed: steerSpeed);
        }

        private ThreatAssessment AssessThreats(HumanoidBot bot, Vector2 myCenter, Vector2 myMomentum, int myShips)
        {
            var result = new ThreatAssessment();

            int maxThreatShips = 0;
            int nearbyCount = 0;
            int totalThreatShips = 0;
            Vector2 weightedThreatVecSum = Vector2.Zero;
            float weightSum = 0f;
            float closingWeightSum = 0f;

            foreach (var enemy in bot.OffScreenTracker.TrackedEnemies)
            {
                if (enemy.Certainty <= 0.10f) continue;

                Vector2 toEnemy = enemy.EstimatedPosition - myCenter;
                float dist = toEnemy.Length();
                if (dist > 950f || dist < 1f) continue;

                float ratio = (float)myShips / Math.Max(1, enemy.ShipCount);
                if (enemy.ShipCount > maxThreatShips)
                {
                    maxThreatShips = enemy.ShipCount;
                }

                // Count meaningful threats within engagement/pinch radius (ignore negligible fresh spawns when we dominate)
                if (ratio < 1.35f || (enemy.ShipCount >= 3 && enemy.ShipCount >= myShips * 0.25f))
                {
                    nearbyCount++;
                    totalThreatShips += enemy.ShipCount;

                    float prox = 1.0f - (dist / 950f);
                    float w = (0.35f + 0.65f * prox) * enemy.Certainty;
                    Vector2 dir = toEnemy / dist;
                    weightedThreatVecSum += dir * w;
                    weightSum += w;

                    // Extra urgency when threat is actively closing in on us
                    bool isClosing = Vector2.Dot(enemy.EstimatedVelocity, -dir) > 0.05f;
                    if (isClosing)
                    {
                        closingWeightSum += w;
                    }

                    // Very near a much larger fleet (triggers defensive boost for skilled bots)
                    float overwhelmingRange = isClosing ? 460f : 400f;
                    if (enemy.Certainty > 0.25f
                        && dist < overwhelmingRange
                        && enemy.ShipCount >= myShips * 1.75f
                        && enemy.ShipCount >= myShips + 5)
                    {
                        result.HasOverwhelmingThreat = true;
                    }
                }
            }

            result.NearbyThreatCount = nearbyCount;

            // 1. Extreme survival pressure: restricted strictly to 1-ship fleets facing real danger
            if (myShips == 1 && (maxThreatShips >= 3 || nearbyCount >= 2))
            {
                result.SingleShipPressure = Math.Clamp(0.85f + 0.15f * MathF.Min(1f, maxThreatShips / 10f), 0f, 1f);
            }

            // 2. Surround / multi-player dogpile pressure (drives defensive breakout dashing, not passive fleeing)
            if (nearbyCount >= 2 && weightSum > 1e-4f)
            {
                float collectiveRatio = (float)totalThreatShips / Math.Max(1, myShips);
                float collectiveDanger = SmoothStep(0.45f, 1.25f, collectiveRatio);
                if (collectiveDanger > 0.001f)
                {
                    float angularSpread = 1.0f - Math.Clamp(weightedThreatVecSum.Length() / weightSum, 0f, 1f);
                    float closingFactor = Math.Clamp(closingWeightSum / weightSum, 0f, 1f);
                    float countFactor = Math.Clamp((nearbyCount - 1) / 3f, 0.25f, 1f);

                    float rawSurround = collectiveDanger * countFactor * (0.40f + 0.40f * angularSpread + 0.20f * closingFactor);
                    if (bot.IsLeader)
                    {
                        rawSurround *= 1.30f;
                    }

                    result.SurroundPressure = Math.Clamp(rawSurround, 0f, 1f);
                }
            }

            // Restrict continuous retreat steering strictly to 1-ship survival situations
            result.RetreatPressure = result.SingleShipPressure;

            result.SafestBreakoutDir = ComputeSafestBreakoutDirection(bot, myCenter, myMomentum);
            return result;
        }

        private Vector2 ComputeSafestBreakoutDirection(HumanoidBot bot, Vector2 myCenter, Vector2 myMomentum)
        {
            float bestScore = float.MinValue;
            Vector2 bestRay = new Vector2(1f, 0f);
            float safeLimit = Math.Max(150f, bot.EffectiveWorldSize - bot.Parameters.DangerZoneBuffer);
            Vector2 momDir = myMomentum.LengthSquared() > 1e-4f ? Vector2.Normalize(myMomentum) : Vector2.Zero;

            var bullets = bot.SensorBullets.VisibleBullets;

            for (int r = 0; r < RayCount; r++)
            {
                Vector2 ray = BreakoutRays[r];
                float score = 0f;

                // Penalize directions pointing toward nearby enemies
                foreach (var enemy in bot.OffScreenTracker.TrackedEnemies)
                {
                    if (enemy.Certainty <= 0.10f) continue;

                    Vector2 toEnemy = enemy.EstimatedPosition - myCenter;
                    float dist = toEnemy.Length();
                    if (dist > 1050f || dist < 1f) continue;

                    float prox = 1.0f - (dist / 1050f);
                    float alignment = Vector2.Dot(ray, toEnemy / dist);
                    float shipFactor = 0.6f + 0.4f * MathF.Min(1f, enemy.ShipCount / 15f);
                    score -= MathF.Max(-0.35f, alignment) * prox * shipFactor * 2.4f;
                }

                // Penalize directions heading into incoming bullet paths
                int bulletSamples = 0;
                for (int bIdx = 0; bIdx < bullets.Count && bulletSamples < 24; bIdx++)
                {
                    var b = bullets[bIdx];
                    Vector2 toBullet = b.Position - myCenter;
                    float bDist = toBullet.Length();
                    if (bDist > 750f || bDist < 1f) continue;
                    if (Vector2.Dot(b.Momentum, -toBullet) <= 0f) continue;

                    bulletSamples++;
                    float prox = 1.0f - (bDist / 750f);
                    float align = MathF.Max(0f, Vector2.Dot(ray, toBullet / bDist));
                    score -= align * prox * 0.45f;
                }

                // Penalize projected out-of-bounds landings
                Vector2 projected = myCenter + ray * 650f;
                float overX = MathF.Max(0f, MathF.Abs(projected.X) - safeLimit);
                float overY = MathF.Max(0f, MathF.Abs(projected.Y) - safeLimit);
                if (overX > 0f || overY > 0f)
                {
                    score -= 1.8f + (overX + overY) / 400f;
                }

                // Gentle momentum continuity so turns feel human rather than erratic
                if (momDir != Vector2.Zero)
                {
                    score += Vector2.Dot(ray, momDir) * 0.25f;
                }

                if (score > bestScore)
                {
                    bestScore = score;
                    bestRay = ray;
                }
            }

            return bestRay;
        }

        private void ScanIncomingBullets(
            HumanoidBot bot,
            uint myFleetId,
            Vector2 myCenter,
            Vector2 myMomentum,
            int myShips,
            Vector2 breakoutDir)
        {
            bool isCommittedToDodge = bot.GameTime < _activeDodgeUntil;
            if (isCommittedToDodge || bot.GameTime < _nextBulletScanTime)
            {
                return;
            }

            long scanIntervalMs = (long)(130f - 90f * bot.Parameters.SkillLevel);
            _nextBulletScanTime = bot.GameTime + Math.Max(40L, scanIntervalMs);

            var bullets = bot.SensorBullets.VisibleBullets;
            Body mostThreateningBullet = null;
            float soonestCpa = float.MaxValue;
            float threateningDist = float.MaxValue;
            Vector2 threateningMissOffset = Vector2.Zero;
            int incomingCount = 0;

            // Only dodge bullets whose projected trajectory intersects our fleet radius + safety margin
            float hitRadius = 28f + MathF.Sqrt(Math.Max(1, myShips)) * 14f + 85f;
            float hitRadiusSq = hitRadius * hitRadius;

            for (int i = 0; i < bullets.Count; i++)
            {
                var b = bullets[i];
                if (b.Group?.Owner == myFleetId) continue;

                Vector2 toBullet = b.Position - myCenter;
                float dist = toBullet.Length();
                if (dist > 850f) continue;

                float speedSq = b.Momentum.LengthSquared();
                if (speedSq < 1e-6f) continue;

                float tCpa = Vector2.Dot(myCenter - b.Position, b.Momentum) / speedSq;
                if (tCpa <= 0f || tCpa > 1200f) continue;

                Vector2 cpaPoint = b.Position + b.Momentum * tCpa;
                Vector2 missOffset = cpaPoint - myCenter;
                if (missOffset.LengthSquared() > hitRadiusSq) continue;

                incomingCount++;
                if (tCpa < soonestCpa)
                {
                    soonestCpa = tCpa;
                    threateningDist = dist;
                    mostThreateningBullet = b;
                    threateningMissOffset = missOffset;
                }
            }

            if (mostThreateningBullet == null)
            {
                _activeDodgeThreatDist = float.MaxValue;
                _activeDodgeSoonestCpa = float.MaxValue;
                _activeDodgeBulletCount = 0;
                return;
            }

            // Always update imminent bullet threat telemetry so defensive boosts can react even if dodge perception missed
            _activeDodgeThreatDist = threateningDist;
            _activeDodgeSoonestCpa = soonestCpa;
            _activeDodgeBulletCount = incomingCount;

            bool noticed = Random.Shared.NextDouble() < bot.Parameters.BulletDodgeProbability;
            if (!noticed)
            {
                return;
            }

            Vector2 toThreatBullet = mostThreateningBullet.Position - myCenter;
            Vector2 mom = mostThreateningBullet.Momentum;
            Vector2 perpB = Vector2.Normalize(new Vector2(-mom.Y, mom.X));

            // Step away from the bullet's CPA miss-offset, blended with safe breakout corridor & momentum
            Vector2 awayFromCpa = threateningMissOffset.LengthSquared() > 1f
                ? -Vector2.Normalize(threateningMissOffset)
                : Vector2.Zero;
            Vector2 preferenceDir = awayFromCpa * 1.1f
                + breakoutDir * 0.55f
                + (myMomentum.LengthSquared() > 0.05f ? Vector2.Normalize(myMomentum) * 0.45f : Vector2.Zero);
            if (preferenceDir.LengthSquared() > 1e-4f)
            {
                if (Vector2.Dot(perpB, preferenceDir) < 0f)
                {
                    perpB = -perpB;
                }
            }
            else if (Vector2.Dot(perpB, -toThreatBullet) < 0f)
            {
                perpB = -perpB;
            }

            if (bot.Parameters.BulletDodgeAngularError > 0.01f)
            {
                float errAngle = (float)(Random.Shared.NextDouble() * 2.0 - 1.0) * bot.Parameters.BulletDodgeAngularError;
                float cos = MathF.Cos(errAngle);
                float sin = MathF.Sin(errAngle);
                perpB = new Vector2(perpB.X * cos - perpB.Y * sin, perpB.X * sin + perpB.Y * cos);
            }

            float dodgeStrength = 5.5f + 4.0f * bot.Parameters.BulletDodgeSkill;
            float weight = Math.Clamp(1.0f - (threateningDist / 850f), 0.30f, 1.0f);
            _activeDodgeImpulse = perpB * (weight * dodgeStrength);
            _activeDodgeThreatDist = threateningDist;
            _activeDodgeBulletCount = incomingCount;

            long latency = Math.Max(15L, (long)(bot.Parameters.ReactionLatencyMs * (0.55f - 0.38f * bot.Parameters.SkillLevel)));
            long refractoryMs = Math.Max(20L, (long)(140f - 120f * bot.Parameters.SkillLevel));
            _activeDodgeStartTime = bot.GameTime + latency;
            _activeDodgeUntil = _activeDodgeStartTime + 260;
            _nextBulletScanTime = _activeDodgeUntil + refractoryMs;
        }

        private bool HandleDashes(
            HumanoidBot bot,
            Vector2 myCenter,
            Vector2 myMomentum,
            int myShips,
            TrackedEnemy target,
            float targetDistance,
            ThreatAssessment threats,
            bool isDodging)
        {
            // If already committed to a dash, keep cursor aligned until Boost() triggers or window expires
            if (bot.GameTime < _activeDashUntil && _activeDashTarget != Vector2.Zero)
            {
                bot.Cursor.SetTarget(_activeDashTarget, speed: bot.Parameters.FlickAimSpeed);
                long elapsed = bot.GameTime - (_activeDashUntil - 220);
                if (bot.CanBoost && (bot.Cursor.IsAimedAt(_activeDashTarget, 0.42f) || elapsed > 110))
                {
                    Vector2 dashDir = _activeDashTarget - myCenter;
                    bot.TriggerBoost(dashDir);
                    _activeDashUntil = 0;
                    _activeDashTarget = Vector2.Zero;
                    return true;
                }
                return true;
            }

            _activeDashTarget = Vector2.Zero;
            _activeDashUntil = 0;

            bool urgentBulletHit = _activeDodgeBulletCount >= 1
                && (_activeDodgeSoonestCpa < 520f || _activeDodgeThreatDist < 360f || _activeDodgeBulletCount >= 3);
            bool urgentDefensiveSituation = urgentBulletHit || threats.HasOverwhelmingThreat;

            if (!urgentDefensiveSituation && bot.GameTime - _lastDashEvalTime < 220)
            {
                return false;
            }
            _lastDashEvalTime = bot.GameTime;

            bool canDefensiveDash = bot.CanBoost
                && bot.Parameters.DefensiveDashEnabled
                && myShips >= bot.Parameters.MinimumShipsToDefensiveDash
                && (bot.GameTime - _lastDefensiveDashTime > 1300);

            if (canDefensiveDash)
            {
                float surroundTrigger = 0.95f + (0.42f - 0.95f) * bot.Parameters.SurroundEscapeSkill;
                bool isSurrounded = threats.SurroundPressure >= surroundTrigger;

                if (urgentBulletHit || threats.HasOverwhelmingThreat || isSurrounded)
                {
                    float commitProb = Math.Clamp(
                        bot.Parameters.DefensiveDashSkill * 1.15f * (1.0f - bot.Parameters.BoostHesitancy * 0.5f),
                        0f,
                        0.96f);

                    if (Random.Shared.NextDouble() < commitProb
                        && TryFindBulletFreeDashDirection(bot, myCenter, myMomentum, myShips, out Vector2 safeDashDir))
                    {
                        Vector2 projected = myCenter + safeDashDir * 680f;
                        _activeDashTarget = bot.ClampToSafePlayableArea(projected);
                        _activeDashUntil = bot.GameTime + 220;
                        _lastDefensiveDashTime = bot.GameTime;
                        bot.Cursor.SetTarget(_activeDashTarget, speed: bot.Parameters.FlickAimSpeed);
                        return true;
                    }
                }
            }

            // Priority 2: Offensive dash (only when NOT pressured to retreat, overwhelmed, or surrounded)
            bool canOffensiveDash = bot.CanBoost
                && bot.Parameters.OffensiveDashEnabled
                && myShips >= bot.Parameters.MinimumShipsToOffensiveDash
                && !threats.HasOverwhelmingThreat
                && threats.RetreatPressure < 0.25f
                && threats.SurroundPressure < 0.30f
                && (bot.GameTime - _lastOffensiveDashTime > 1200);

            if (canOffensiveDash && target != null && target.Certainty > 0.7f && targetDistance > 180f && targetDistance < 950f)
            {
                float commitProb = bot.Parameters.OffensiveDashSkill * (1.0f - bot.Parameters.BoostHesitancy);
                if (Random.Shared.NextDouble() < commitProb)
                {
                    bool isSmallEnemy = target.ShipCount <= 5;
                    bool hasDecisiveAdvantage = myShips >= target.ShipCount * 1.2f;
                    bool isEnemyFleeing = Vector2.Dot(target.EstimatedVelocity, target.EstimatedPosition - myCenter) > 0f;

                    if (isSmallEnemy || hasDecisiveAdvantage || (isEnemyFleeing && myShips >= 4))
                    {
                        Vector2 toEnemy = Vector2.Normalize(target.EstimatedPosition - myCenter);
                        Vector2 projected = myCenter + toEnemy * 700f;
                        if (IsDashDestinationSafe(bot, projected))
                        {
                            Vector2 aimPoint = bot.ComputeHumanAimPoint(target.EstimatedPosition, target.EstimatedVelocity);
                            _activeDashTarget = aimPoint;
                            _activeDashUntil = bot.GameTime + 220;
                            _lastOffensiveDashTime = bot.GameTime;
                            bot.Cursor.SetTarget(_activeDashTarget, speed: bot.Parameters.FlickAimSpeed);
                            return true;
                        }
                    }
                }
            }

            return false;
        }

        private static bool TryShootEscapeCorridorFood(
            HumanoidBot bot,
            Vector2 myCenter,
            Vector2 escapeHeading,
            Vector2 flightDir)
        {
            if (escapeHeading.LengthSquared() < 1e-4f)
                return false;

            Game.Robots.Models.Ship bestItem = null;
            float bestScore = float.MinValue;

            var abandoned = bot.SensorAbandoned.AllVisibleAbandoned;
            for (int i = 0; i < abandoned.Count; i++)
            {
                var item = abandoned[i];
                Vector2 toItem = item.Position - myCenter;
                float dist = toItem.Length();
                if (dist < 20f || dist > 550f) continue;

                float dot = Vector2.Dot(toItem / dist, escapeHeading);
                if (dot > 0.55f)
                {
                    float score = dot * 2.0f + (1.0f - dist / 550f) + 3.0f;
                    if (score > bestScore)
                    {
                        bestScore = score;
                        bestItem = item;
                    }
                }
            }

            var fish = bot.SensorFish.AllVisibleFish;
            for (int i = 0; i < fish.Count; i++)
            {
                var item = fish[i];
                Vector2 toItem = item.Position - myCenter;
                float dist = toItem.Length();
                if (dist < 20f || dist > 550f) continue;

                float dot = Vector2.Dot(toItem / dist, escapeHeading);
                if (dot > 0.65f)
                {
                    float score = dot * 2.0f + (1.0f - dist / 550f);
                    if (score > bestScore)
                    {
                        bestScore = score;
                        bestItem = item;
                    }
                }
            }

            if (bestItem == null)
                return false;

            return bot.AimController.TryAimAndShoot(
                bot,
                bestItem.Position,
                bestItem.Momentum,
                flightDir,
                usePredictiveLead: true,
                extraAngleTolerance: 0.08f,
                enforceOffAxisGate: true,
                allowAbort: true);
        }

        private static bool TryFindBulletFreeDashDirection(
            HumanoidBot bot,
            Vector2 myCenter,
            Vector2 myMomentum,
            int myShips,
            out Vector2 bestDir)
        {
            bestDir = Vector2.Zero;
            float bestScore = float.MinValue;
            Vector2 momDir = myMomentum.LengthSquared() > 1e-4f ? Vector2.Normalize(myMomentum) : Vector2.Zero;
            var bullets = bot.SensorBullets.VisibleBullets;
            float bulletClearanceRadius = 90f + MathF.Sqrt(Math.Max(1, myShips)) * 10f;

            for (int r = 0; r < RayCount; r++)
            {
                Vector2 ray = BreakoutRays[r];
                Vector2 projected = myCenter + ray * 680f;
                if (!IsDashDestinationSafe(bot, projected))
                {
                    continue;
                }

                bool hasBulletHazard = false;
                float bulletPenalty = 0f;

                for (int bIdx = 0; bIdx < bullets.Count; bIdx++)
                {
                    var b = bullets[bIdx];
                    if (b.Group?.Owner == bot.FleetID) continue;

                    Vector2 toBullet = b.Position - myCenter;
                    float dist = toBullet.Length();
                    if (dist > 750f) continue;

                    // 1. Check if bullet currently sits directly ahead along this dash corridor
                    float projAlongRay = Vector2.Dot(toBullet, ray);
                    if (projAlongRay > -30f && projAlongRay < 680f)
                    {
                        float perpDistSq = MathF.Max(0f, dist * dist - projAlongRay * projAlongRay);
                        if (perpDistSq < bulletClearanceRadius * bulletClearanceRadius)
                        {
                            hasBulletHazard = true;
                            break;
                        }
                    }

                    // 2. Check if bullet momentum crosses into the forward dash path within ~600ms
                    Vector2 relVel = b.Momentum - ray * 0.65f;
                    float relSpeedSq = relVel.LengthSquared();
                    if (relSpeedSq > 1e-6f)
                    {
                        float tCross = -Vector2.Dot(toBullet, relVel) / relSpeedSq;
                        if (tCross > 0f && tCross < 650f)
                        {
                            Vector2 relAtCross = toBullet + relVel * tCross;
                            if (relAtCross.LengthSquared() < (bulletClearanceRadius * 0.85f) * (bulletClearanceRadius * 0.85f))
                            {
                                bulletPenalty += 1.5f;
                            }
                        }
                    }
                }

                if (hasBulletHazard)
                {
                    continue;
                }

                float score = -bulletPenalty;

                // Prefer directions pointing away from nearby/overwhelming enemies
                foreach (var enemy in bot.OffScreenTracker.TrackedEnemies)
                {
                    if (enemy.Certainty <= 0.10f) continue;

                    Vector2 toEnemy = enemy.EstimatedPosition - myCenter;
                    float dist = toEnemy.Length();
                    if (dist > 1000f || dist < 1f) continue;

                    float prox = 1.0f - (dist / 1000f);
                    float align = Vector2.Dot(ray, toEnemy / dist);
                    float sizeFactor = enemy.ShipCount >= myShips * 1.5f ? 1.8f : 1.0f;
                    score -= MathF.Max(-0.35f, align) * prox * sizeFactor * 2.5f;
                }

                if (momDir != Vector2.Zero)
                {
                    score += Vector2.Dot(ray, momDir) * 0.25f;
                }

                if (score > bestScore)
                {
                    bestScore = score;
                    bestDir = ray;
                }
            }

            return bestScore > float.MinValue;
        }

        private static bool IsDashDestinationSafe(HumanoidBot bot, Vector2 projectedPos)
        {
            float limit = Math.Max(150f, bot.EffectiveWorldSize - Math.Max(300f, bot.Parameters.DangerZoneBuffer));
            return MathF.Abs(projectedPos.X) < limit && MathF.Abs(projectedPos.Y) < limit;
        }

        private static float SmoothStep(float edge0, float edge1, float x)
        {
            float t = Math.Clamp((x - edge0) / Math.Max(1e-5f, edge1 - edge0), 0f, 1f);
            return t * t * (3f - 2f * t);
        }

        private static float Lerp(float a, float b, float t) => a + (b - a) * Math.Clamp(t, 0f, 1f);
    }
}
