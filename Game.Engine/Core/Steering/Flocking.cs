namespace Game.Engine.Core.Steering
{
    using Game.API.Common.Models;
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Numerics;

    public static class Flocking
    {
        public static Vector2 Cohesion(IEnumerable<Ship> ships, Ship ship, int maximumDistance)
        {
            var exclusiveCenter = Vector2.Zero;
            int shipsIncluded = 0;
            foreach (var shipOther in ships)
            {
                if (shipOther != ship)
                {
                    var distance = Vector2.Distance(ship.Position, shipOther.Position);
                    if (distance < maximumDistance)
                    {
                        exclusiveCenter += shipOther.Position;
                        shipsIncluded++;
                    }
                }
            }

            if (shipsIncluded > 0)
            {
                exclusiveCenter /= shipsIncluded;
                var relative = exclusiveCenter - ship.Position;
                var distance = Vector2.Distance(ship.Position, exclusiveCenter);

                if (relative == Vector2.Zero)
                    return Vector2.Zero;

                var vec = Vector2.Normalize(relative) * distance;

                return vec;
            }
            else
                return Vector2.Zero;
        }

        public static Vector2 Separation(IEnumerable<Ship> ships, Ship ship, float minimumDistanceB, float minimumDistanceM)
        {
            var accumulator = Vector2.Zero;
            foreach (var shipOther in ships)
            {
                if (shipOther != ship)
                {
                    var distance = Vector2.Distance(ship.Position, shipOther.Position);
                    int minimumDistance = (int)(Math.Round(minimumDistanceM * ships.Count() + minimumDistanceB));
                    if (distance < minimumDistance)
                    {
                        if (distance < 1)
                            distance = 1;

                        accumulator += (ship.Position - shipOther.Position) * (1 / (distance * distance) - 1 / (minimumDistance * minimumDistance));
                    }
                }
            }

            return accumulator;
        }

        public static Vector2 Alignment(IEnumerable<Ship> ships, Ship ship)
        {
            var accumulator = Vector2.Zero;
            foreach (var shipOther in ships)
                if (shipOther != ship)
                    accumulator += shipOther.Momentum;

            return accumulator / (ships.Count() - 1);
        }

        /// <summary>
        /// Applies authentic solid-disc non-penetration position relaxation (PBD)
        /// and soft straggler cohesion bounding across ships within a fleet.
        /// </summary>
        public static void Relaxation(Fleet fleet)
        {
            var ships = fleet?.Ships;
            if (ships == null || ships.Count < 2)
                return;

            var hook = fleet.World?.Hook;
            if (hook == null)
                return;

            float solidDiameter = hook.FlockSolidDiameter;
            if (solidDiameter <= 0.001f)
                return;

            float pushStiffness = hook.FlockPushStiffness;
            float cohesionDistance = hook.FlockCohesionDistance;
            float cohesionWeight = hook.FlockCohesionWeight;
            int iterations = Math.Max(1, hook.FlockRelaxationIterations);

            int count = ships.Count;

            for (int iter = 0; iter < iterations; iter++)
            {
                // 1. Pairwise solid-disc non-penetration pass
                for (int i = 0; i < count; i++)
                {
                    var shipA = ships[i];
                    var posA = shipA.Position;

                    for (int j = i + 1; j < count; j++)
                    {
                        var shipB = ships[j];
                        var posB = shipB.Position;

                        var rVec = posB - posA;
                        float distSq = rVec.LengthSquared();

                        if (distSq < solidDiameter * solidDiameter && distSq > 0.0001f)
                        {
                            float dist = MathF.Sqrt(distSq);
                            float overlap = solidDiameter - dist;
                            Vector2 push = (rVec / dist) * (overlap * 0.5f * pushStiffness);

                            shipA.Position -= push;
                            shipB.Position += push;
                            posA = shipA.Position;
                        }
                        else if (distSq <= 0.0001f)
                        {
                            // Distinct radial dispersal for identical position spawn bursts
                            float angle = (float)(i * 2.39996323f + j);
                            Vector2 push = new Vector2(MathF.Cos(angle), MathF.Sin(angle)) * (solidDiameter * 0.5f * pushStiffness);
                            shipA.Position -= push;
                            shipB.Position += push;
                            posA = shipA.Position;
                        }
                    }
                }

                // 2. Soft straggler cohesion bounding towards fleet centroid
                if (cohesionWeight > 0.00001f && count >= 3)
                {
                    Vector2 center = fleet.FleetCenter;
                    for (int i = 0; i < count; i++)
                    {
                        var ship = ships[i];
                        Vector2 toCenter = center - ship.Position;
                        float distSq = toCenter.LengthSquared();
                        if (distSq > cohesionDistance * cohesionDistance)
                        {
                            float dist = MathF.Sqrt(distSq);
                            Vector2 pull = (toCenter / dist) * ((dist - cohesionDistance) * cohesionWeight);
                            ship.Position += pull;
                        }
                    }
                }
            }
        }

        public static void Flock(Ship ship)
        {
            if (ship.World.Hook.FlockWeight == 0)
                return;

            var fleet = ship.Fleet;
            var hook = ship.World.Hook;

            if (fleet?.Ships == null || fleet.Ships.Count < 2)
                return;

            var shipFlockingVector =
                (hook.FlockCohesion * Flocking.Cohesion(fleet.Ships, ship, hook.FlockCohesionMaximumDistance))
                + (hook.FlockSeparation * Flocking.Separation(fleet.Ships, ship, hook.FlockSeparationMinimumDistanceB, hook.FlockSeparationMinimumDistanceM));

            var steeringVector = new Vector2(MathF.Cos(ship.AngleMovement), MathF.Sin(ship.AngleMovement));
            steeringVector += hook.FlockWeight * shipFlockingVector;

            ship.AngleMovement = MathF.Atan2(steeringVector.Y, steeringVector.X);
        }
    }
}
