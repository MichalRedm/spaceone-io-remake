namespace Game.Engine.Core.Steering
{
    using System;
    using System.Numerics;

    public static class Flocking
    {
        /// <summary>
        /// Applies authentic solid-disc non-penetration position relaxation (PBD)
        /// with local cursor compaction and soft straggler cohesion bounding across ships within a fleet.
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

            Span<Vector2> displacements = count <= 128 ? stackalloc Vector2[count] : new Vector2[count];
            Span<float> weights = count <= 128 ? stackalloc float[count] : new float[count];

            Vector2 mousePos = fleet.FleetCenter + fleet.AimTarget;

            for (int iter = 0; iter < iterations; iter++)
            {
                displacements.Clear();
                weights.Clear();

                // 1. Local Cursor Compaction (Spatial Pull)
                // Drives ships physically into the smaller 0.95x solidDiameter bounds without kinematic heading convergence.
                // Using a PBD spatial pull preserves perfect 2D formation and completely eliminates heading jitter 
                // and line-collapse for small fleets.
                for (int i = 0; i < count; i++)
                {
                    var ship = ships[i];
                    Vector2 toMouse = mousePos - ship.Position;
                    float distSq = toMouse.LengthSquared();
                    if (distSq < 60.0f * 60.0f && distSq > 0.001f)
                    {
                        float dist = MathF.Sqrt(distSq);
                        // Gentle pull (max 0.4px per iteration at exact center) fading to 0 at 60px
                        float pull = 0.4f * (1.0f - (dist / 60.0f));
                        ship.Position += (toMouse / dist) * pull;
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

                // 3. Pairwise solid-disc non-penetration pass with local mouse proximity compaction
                for (int i = 0; i < count; i++)
                {
                    var posA = ships[i].Position;

                    for (int j = i + 1; j < count; j++)
                    {
                        var posB = ships[j].Position;
                        var rVec = posB - posA;
                        float distSq = rVec.LengthSquared();

                        // Local compaction: only shrink the resting solid disc diameter for ships in the immediate vicinity of the mouse cursor
                        // Empirically tuned to match original game: ~5% max compaction, falling off at 60px distance.
                        Vector2 midPoint = (posA + posB) * 0.5f;
                        float distToMouse = Vector2.Distance(midPoint, mousePos);
                        float localScale = 0.95f + 0.05f * Math.Clamp(distToMouse / 60.0f, 0.0f, 1.0f);
                        float pairSolidDiameter = solidDiameter * localScale;

                        if (distSq < pairSolidDiameter * pairSolidDiameter && distSq > 0.001f)
                        {
                            float dist = MathF.Sqrt(distSq);
                            float overlap = pairSolidDiameter - dist;
                            // Smooth quadratic factor: goes smoothly to 0 as dist approaches pairSolidDiameter
                            float smooth = 1.0f - (dist / pairSolidDiameter);
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
                            Vector2 push = new Vector2(MathF.Cos(angle), MathF.Sin(angle)) * (pairSolidDiameter * 0.5f * pushStiffness);

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
            }
        }
    }
}
