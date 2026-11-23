namespace Game.Robots.Framework
{
    using System;
    using System.Numerics;

    /// <summary>
    /// Shared human-like aiming, flicking, and firing controller used uniformly across combat,
    /// kiting, abandoned-ship reclaiming, and cruising food collection.
    /// </summary>
    public sealed class AimAndShootController
    {
        private long _flickStartTime;
        private long _abortUntilTime;
        private long _shotConfirmUntil;
        private Vector2 _lockedAimOffset;
        private float _flickJitterAngle;
        private bool _hasFlickJitter;

        /// <summary>
        /// Clears all flick and cooldown tracking timers.
        /// </summary>
        public void Reset()
        {
            _flickStartTime = 0;
            _abortUntilTime = 0;
            _shotConfirmUntil = 0;
            _lockedAimOffset = Vector2.Zero;
            _flickJitterAngle = 0f;
            _hasFlickJitter = false;
        }

        /// <summary>
        /// Attempts to pre-aim and fire at a target using consistent human cursor kinematics.
        /// Returns true when aiming claims the cursor for this tick; false when navigation should steer.
        /// </summary>
        public bool TryAimAndShoot(
            HumanoidBot bot,
            Vector2 targetPos,
            Vector2 targetVel,
            Vector2 flightDirection,
            bool usePredictiveLead = true,
            float extraAngleTolerance = 0f,
            bool requireStrictAlignment = false,
            bool enforceOffAxisGate = false,
            bool allowAbort = false)
        {
            if (bot == null)
                return false;

            if (!float.IsFinite(targetPos.X) || !float.IsFinite(targetPos.Y))
                return false;

            if (!float.IsFinite(targetVel.X) || !float.IsFinite(targetVel.Y))
                targetVel = Vector2.Zero;

            // Brief shot-confirmation hold: keep aim and trigger active until the server confirms cooldown reset (< 0.99f)
            // or the 80ms window expires so turn-backs never overwrite a pending shot before World.Step().
            if (_shotConfirmUntil > 0)
            {
                if (bot.CooldownShoot < 0.99f || bot.GameTime >= _shotConfirmUntil)
                {
                    _shotConfirmUntil = 0;
                }
                else
                {
                    Vector2 heldTarget = bot.Position + _lockedAimOffset;
                    bot.Cursor.SetTarget(heldTarget, speed: bot.Parameters.FlickAimSpeed);
                    bot.ShootAt(heldTarget);
                    return true;
                }
            }

            // Keep cursor free during brief post-abort refractory window (opportunistic shots only).
            if (allowAbort && bot.GameTime < _abortUntilTime)
            {
                _flickStartTime = 0;
                _hasFlickJitter = false;
                return false;
            }

            // CooldownShoot ramps UP from 0.0 (just fired) to 1.0 (ready).
            // Release cursor immediately after firing so we do not linger facing backward.
            bool readyOrPreAiming = bot.CanShoot
                || (bot.CooldownShoot >= bot.Parameters.PreAimCooldownThreshold && !bot.Shooting);

            if (!readyOrPreAiming)
            {
                _flickStartTime = 0;
                _hasFlickJitter = false;
                return false;
            }

            Vector2 toTarget = targetPos - bot.Position;
            if (toTarget.LengthSquared() < 1f)
            {
                _flickStartTime = 0;
                _hasFlickJitter = false;
                return false;
            }

            // Smoothly gate opportunistic off-axis shots (e.g. trailing abandoned ships / escape food)
            // when requested, while never blocking combat enemies from turning and shooting.
            float maxOffAxis = bot.Parameters.MaxOffAxisShotAngle;
            if (enforceOffAxisGate && maxOffAxis < MathF.PI - 0.02f && flightDirection.LengthSquared() > 1e-4f
                && float.IsFinite(flightDirection.X) && float.IsFinite(flightDirection.Y))
            {
                float flightAngle = MathF.Atan2(flightDirection.Y, flightDirection.X);
                float targetAngle = MathF.Atan2(toTarget.Y, toTarget.X);
                float diff = WrapAngle(targetAngle - flightAngle);
                if (MathF.Abs(diff) > maxOffAxis)
                {
                    _flickStartTime = 0;
                    _hasFlickJitter = false;
                    return false;
                }
            }

            // Deterministic kinematic lead + stable per-flick human angular jitter (prevents 40ms jitter bouncing)
            Vector2 vel = usePredictiveLead ? targetVel : Vector2.Zero;
            Vector2 interceptPoint = InterceptionMath.CalculateInterceptPoint(bot.Position, bot.EffectiveBulletSpeed, targetPos, vel);
            Vector2 aimTarget = Vector2.Lerp(targetPos, interceptPoint, bot.Parameters.PredictiveAimFactor);

            if (!_hasFlickJitter)
            {
                _flickJitterAngle = bot.Parameters.AimJitter > 0.001f
                    ? (float)(Random.Shared.NextDouble() * 2.0 - 1.0) * bot.Parameters.AimJitter
                    : 0f;
                _hasFlickJitter = true;
            }

            if (MathF.Abs(_flickJitterAngle) > 0.001f)
            {
                Vector2 toAim = aimTarget - bot.Position;
                float dist = toAim.Length();
                if (dist > 0.001f)
                {
                    float jitteredAngle = MathF.Atan2(toAim.Y, toAim.X) + _flickJitterAngle;
                    aimTarget = bot.Position + new Vector2(MathF.Cos(jitteredAngle), MathF.Sin(jitteredAngle)) * dist;
                }
            }

            bot.Cursor.SetTarget(aimTarget, speed: bot.Parameters.FlickAimSpeed);

            // While weapon is still finishing its final cooldown tick(s), pre-aim cleanly without starting the abort timer.
            if (!bot.CanShoot)
            {
                _flickStartTime = 0;
                return true;
            }

            if (_flickStartTime == 0)
            {
                _flickStartTime = bot.GameTime;
            }

            float tolerance = Math.Max(0.05f, bot.Parameters.FiringAngleTolerance + extraAngleTolerance);
            long flickDuration = bot.GameTime - _flickStartTime;

            if (bot.Cursor.IsAimedAt(aimTarget, tolerance))
            {
                FireWithConfirmHold(bot, aimTarget);
                return true;
            }

            // Scale bounded flick window smoothly with reaction latency and angular sweep.
            float currentAngle = MathF.Atan2(bot.Cursor.CurrentRelativePosition.Y, bot.Cursor.CurrentRelativePosition.X);
            float aimRelX = aimTarget.X - bot.Position.X;
            float aimRelY = aimTarget.Y - bot.Position.Y;
            float desiredAngle = (aimRelX * aimRelX + aimRelY * aimRelY) > 1e-4f
                ? MathF.Atan2(aimRelY, aimRelX)
                : currentAngle;
            float sweepFraction = MathF.Abs(WrapAngle(desiredAngle - currentAngle)) / MathF.PI;
            float speedCompensation = 1.0f / Math.Clamp(bot.Parameters.FlickAimSpeed, 0.25f, 1.0f);
            long maxFlickWait = Math.Clamp(
                (long)((bot.Parameters.ReactionLatencyMs * (0.45f + 0.35f * sweepFraction) + 80f) * MathF.Min(1.6f, speedCompensation)),
                200L,
                380L);

            if (flickDuration > maxFlickWait)
            {
                if (!requireStrictAlignment && bot.Cursor.IsAimedAt(aimTarget, tolerance * 2.0f))
                {
                    FireWithConfirmHold(bot, aimTarget);
                    return true;
                }

                if (allowAbort)
                {
                    // Abort opportunistic non-combat shot so navigation resumes cleanly.
                    _abortUntilTime = bot.GameTime + 240;
                    _flickStartTime = 0;
                    _hasFlickJitter = false;
                    return false;
                }
            }

            return true;
        }

        private void FireWithConfirmHold(HumanoidBot bot, Vector2 aimTarget)
        {
            bot.ShootAt(aimTarget);
            _lockedAimOffset = aimTarget - bot.Position;
            _shotConfirmUntil = bot.GameTime + 80;
            _flickStartTime = 0;
            _hasFlickJitter = false;
        }

        private static float WrapAngle(float angle)
        {
            if (!float.IsFinite(angle))
                return 0f;

            while (angle > MathF.PI) angle -= MathF.PI * 2f;
            while (angle < -MathF.PI) angle += MathF.PI * 2f;
            return angle;
        }
    }
}
