namespace Game.Engine.Core.Steering
{
    using System;
    using System.Numerics;

    public static class Flocking
    {
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

            float targetLen = fleet.AimTarget.Length();
            // Linear reduction in inter-ship distance as the mouse gets closer to the fleet (down to 75% at 0px, starts below 200px)
            float distScale = 0.75f + 0.25f * MathF.Min(1.0f, targetLen / 200.0f);

            float solidDiameter = hook.FlockSolidDiameter * distScale;
            if (solidDiameter <= 0.001f)
                return;

            float pushStiffness = hook.FlockPushStiffness;
            float cohesionDistance = hook.FlockCohesionDistance * distScale;
            float cohesionWeight = hook.FlockCohesionWeight;
            int iterations = Math.Max(1, hook.FlockRelaxationIterations);

            int count = ships.Count;

            Span<Vector2> displacements = count <= 128 ? stackalloc Vector2[count] : new Vector2[count];
            Span<float> weights = count <= 128 ? stackalloc float[count] : new float[count];

            for (int iter = 0; iter < iterations; iter++)
            {
                displacements.Clear();
                weights.Clear();

                // 1. Pairwise solid-disc non-penetration pass
                for (int i = 0; i < count; i++)
                {
                    var posA = ships[i].Position;

                    for (int j = i + 1; j < count; j++)
                    {
                        var posB = ships[j].Position;
                        var rVec = posB - posA;
                        float distSq = rVec.LengthSquared();

                        if (distSq < solidDiameter * solidDiameter && distSq > 0.001f)
                        {
                            float dist = MathF.Sqrt(distSq);
                            float overlap = solidDiameter - dist;
                            // Smooth quadratic factor: goes smoothly to 0 as dist approaches solidDiameter
                            float smooth = 1.0f - (dist / solidDiameter);
                            Vector2 push = (rVec / dist) * (overlap * 0.5f * pushStiffness * (0.5f + 0.5f * smooth));

                            displacements[i] -= push;
                            displacements[j] += push;
                            weights[i] += 1f;
                            weights[j] += 1f;
                        }
                        else if (distSq <= 0.001f)
                        {
                            // Distinct radial dispersal for identical position spawn bursts
                            float angle = (float)(i * 2.39996323f + j);
                            Vector2 push = new Vector2(MathF.Cos(angle), MathF.Sin(angle)) * (solidDiameter * 0.5f * pushStiffness);

                            displacements[i] -= push;
                            displacements[j] += push;
                            weights[i] += 1f;
                            weights[j] += 1f;
                        }
                    }
                }

                // Apply accumulated pairwise displacements smoothly
                for (int i = 0; i < count; i++)
                {
                    if (weights[i] > 0.001f)
                    {
                        ships[i].Position += displacements[i] / MathF.Max(1.0f, MathF.Sqrt(weights[i]));
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
    }
}
