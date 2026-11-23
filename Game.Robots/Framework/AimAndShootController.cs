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

        /// <summary>
        /// Clears all flick and cooldown tracking timers.
        /// </summary>
        public void Reset()
        {
            _flickStartTime = 0;
            _abortUntilTime = 0;
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
            bool requireStrictAlignment = false)
        {
            if (bot == null)
                return false;

            if (float.IsNaN(targetPos.X) || float.IsNaN(targetPos.Y) || float.IsInfinity(targetPos.X) || float.IsInfinity(targetPos.Y))
                return false;

            // Keep cursor free during brief post-abort refractory window so steering recovers cleanly.
            if (bot.GameTime < _abortUntilTime)
            {
                _flickStartTime = 0;
                return false;
            }

            // CooldownShoot ramps UP from 0.0 (just fired) to 1.0 (ready).
            // Release cursor immediately after firing so we do not linger facing backward.
            bool readyOrPreAiming = bot.CanShoot
                || (bot.CooldownShoot >= bot.Parameters.PreAimCooldownThreshold && !bot.Shooting);

            if (!readyOrPreAiming)
            {
                _flickStartTime = 0;
                return false;
            }

            Vector2 toTarget = targetPos - bot.Position;
            if (toTarget.LengthSquared() < 1f)
            {
                _flickStartTime = 0;
                return false;
            }

            // Smoothly gate off-axis shots by SkillLevel / MaxOffAxisShotAngle:
            // Low-skill bots only fire near their flight direction; advanced bots can flick up to 180 deg.
            float maxOffAxis = bot.Parameters.MaxOffAxisShotAngle;
            if (maxOffAxis < MathF.PI - 0.02f && flightDirection.LengthSquared() > 1e-4f)
            {
                float flightAngle = MathF.Atan2(flightDirection.Y, flightDirection.X);
                float targetAngle = MathF.Atan2(toTarget.Y, toTarget.X);
                float diff = WrapAngle(targetAngle - flightAngle);
                if (MathF.Abs(diff) > maxOffAxis)
                {
                    _flickStartTime = 0;
                    return false;
                }
            }

            if (_flickStartTime == 0)
            {
                _flickStartTime = bot.GameTime;
            }

            Vector2 aimTarget = bot.ComputeHumanAimPoint(targetPos, usePredictiveLead ? targetVel : Vector2.Zero);
            bot.Cursor.SetTarget(aimTarget, speed: bot.Parameters.FlickAimSpeed);

            float tolerance = Math.Max(0.05f, bot.Parameters.FiringAngleTolerance + extraAngleTolerance);
            long flickDuration = bot.GameTime - _flickStartTime;

            // Scale bounded flick window smoothly with reaction latency and angular sweep.
            float currentAngle = MathF.Atan2(bot.Cursor.CurrentRelativePosition.Y, bot.Cursor.CurrentRelativePosition.X);
            float aimRelX = aimTarget.X - bot.Position.X;
            float aimRelY = aimTarget.Y - bot.Position.Y;
            float desiredAngle = (aimRelX * aimRelX + aimRelY * aimRelY) > 1e-4f
                ? MathF.Atan2(aimRelY, aimRelX)
                : currentAngle;
            float sweepFraction = MathF.Abs(WrapAngle(desiredAngle - currentAngle)) / MathF.PI;
            long maxFlickWait = Math.Clamp(
                (long)(bot.Parameters.ReactionLatencyMs * (0.45f + 0.35f * sweepFraction) + 60f),
                90L,
                220L);

            if (bot.CanShoot && bot.Cursor.IsAimedAt(aimTarget, tolerance))
            {
                bot.ShootAt(aimTarget);
                _flickStartTime = 0;
                return true;
            }

            if (flickDuration > maxFlickWait)
            {
                if (!requireStrictAlignment && bot.CanShoot && bot.Cursor.IsAimedAt(aimTarget, tolerance * 1.6f))
                {
                    bot.ShootAt(aimTarget);
                }
                else
                {
                    // Abort cleanly so navigation steering takes over instead of spinning endlessly.
                    _abortUntilTime = bot.GameTime + 240;
                }

                _flickStartTime = 0;
                return false;
            }

            return true;
        }

        private static float WrapAngle(float angle)
        {
            while (angle > MathF.PI) angle -= MathF.PI * 2f;
            while (angle < -MathF.PI) angle += MathF.PI * 2f;
            return angle;
        }
    }
}
