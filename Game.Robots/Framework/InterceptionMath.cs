namespace Game.Robots.Framework
{
    using System;
    using System.Numerics;

    public static class InterceptionMath
    {
        /// <summary>
        /// Solves the kinematic quadratic interception problem:
        /// |(targetPos + targetVel * t) - shooterPos| = bulletSpeed * t
        /// Returns the predicted intercept position in world coordinates.
        /// </summary>
        public static Vector2 CalculateInterceptPoint(
            Vector2 shooterPos,
            float bulletSpeed,
            Vector2 targetPos,
            Vector2 targetVel)
        {
            if (bulletSpeed <= 0.001f)
                return targetPos;

            Vector2 toTarget = targetPos - shooterPos;
            float distSq = toTarget.LengthSquared();
            if (distSq < 0.001f)
                return targetPos;

            float targetSpeedSq = targetVel.LengthSquared();
            float bulletSpeedSq = bulletSpeed * bulletSpeed;

            float a = targetSpeedSq - bulletSpeedSq;
            float b = 2.0f * Vector2.Dot(toTarget, targetVel);
            float c = distSq;

            float t = -1f;

            if (MathF.Abs(a) < 1e-6f)
            {
                // Linear case: target speed matches bullet speed
                if (MathF.Abs(b) > 1e-6f)
                {
                    float tLin = -c / b;
                    if (tLin > 0f) t = tLin;
                }
            }
            else
            {
                float disc = b * b - 4.0f * a * c;
                if (disc >= 0f)
                {
                    float sqrtDisc = MathF.Sqrt(disc);
                    float t1 = (-b - sqrtDisc) / (2.0f * a);
                    float t2 = (-b + sqrtDisc) / (2.0f * a);

                    if (t1 > 0f && t2 > 0f)
                        t = MathF.Min(t1, t2);
                    else if (t1 > 0f)
                        t = t1;
                    else if (t2 > 0f)
                        t = t2;
                }
            }

            // If target is flying directly away faster than bullet speed or discriminant is negative,
            // fallback to naive travel time based on current distance
            if (t <= 0f)
            {
                t = MathF.Sqrt(distSq) / bulletSpeed;
            }

            return targetPos + targetVel * t;
        }
    }
}
