namespace Game.Engine.Core.Steering
{
    using System;
    using System.Numerics;

    public static class Flocking
    {
        /// <summary>
        /// Applies authentic solid-disc non-penetration position relaxation (PBD)
        /// coupled with velocity separation impulses and soft straggler cohesion across ships within a fleet.
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
            float velPushStiffness = hook.FlockVelocityPushStiffness;
            float velDamping = hook.FlockVelocityDamping;
            float cohesionDistance = hook.FlockCohesionDistance;
            float cohesionWeight = hook.FlockCohesionWeight;
            int iterations = Math.Max(1, hook.FlockRelaxationIterations);

            int count = ships.Count;

            Span<Vector2> displacements = count <= 128 ? stackalloc Vector2[count] : new Vector2[count];
            Span<Vector2> velImpulses = count <= 128 ? stackalloc Vector2[count] : new Vector2[count];
            Span<float> weights = count <= 128 ? stackalloc float[count] : new float[count];

            for (int iter = 0; iter < iterations; iter++)
            {
                displacements.Clear();
                velImpulses.Clear();
                weights.Clear();

                // 1. Pairwise solid-disc non-penetration and velocity impulse pass
                for (int i = 0; i < count; i++)
                {
                    var posA = ships[i].Position;
                    var velA = ships[i].Momentum;

                    for (int j = i + 1; j < count; j++)
                    {
                        var posB = ships[j].Position;
                        var velB = ships[j].Momentum;
                        var rVec = posB - posA;
                        float distSq = rVec.LengthSquared();

                        if (distSq < solidDiameter * solidDiameter && distSq > 0.001f)
                        {
                            float dist = MathF.Sqrt(distSq);
                            float overlap = solidDiameter - dist;
                            // Smooth quadratic factor: goes smoothly to 0 as dist approaches solidDiameter
                            float smooth = 1.0f - (dist / solidDiameter);
                            Vector2 rDir = rVec / dist;
                            Vector2 push = rDir * (overlap * 0.5f * pushStiffness * (0.5f + 0.5f * smooth));

                            displacements[i] -= push;
                            displacements[j] += push;

                            // Velocity separation impulse + relative velocity damping
                            if (velPushStiffness > 0.0001f)
                            {
                                Vector2 vImpulse = rDir * (overlap * 0.5f * velPushStiffness);
                                Vector2 relVel = velB - velA;
                                Vector2 vDamp = rDir * (Vector2.Dot(relVel, rDir) * 0.5f * velDamping);

                                velImpulses[i] -= (vImpulse - vDamp);
                                velImpulses[j] += (vImpulse - vDamp);
                            }

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

                // Apply accumulated pairwise displacements and velocity impulses smoothly
                for (int i = 0; i < count; i++)
                {
                    if (weights[i] > 0.001f)
                    {
                        float invWeight = 1.0f / MathF.Max(1.0f, MathF.Sqrt(weights[i]));
                        ships[i].Position += displacements[i] * invWeight;
                        if (velPushStiffness > 0.0001f)
                        {
                            ships[i].Momentum += velImpulses[i] * invWeight;
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
                            if (velPushStiffness > 0.0001f)
                            {
                                ship.Momentum += pull * 0.5f;
                            }
                        }
                    }
                }
            }
        }
    }
}
