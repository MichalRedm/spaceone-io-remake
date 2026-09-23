namespace Game.Engine.Core.Steering
{
    using System;
    using System.Numerics;

    public static class Flocking
    {
        /// <summary>
        /// Applies authentic solid-disc non-penetration position relaxation (PBD)
        /// with a soft attraction zone just outside the solid disc diameter,
        /// and global cursor-proximity fleet compression (distScale).
        ///
        /// Physics model derived from empirical pairwise relative-velocity profile of original Spaceone.io:
        ///   - d &lt; solidDiameter     : repulsion (+1.34 px/tick at 0-15px in ground truth)
        ///   - solidDiameter &lt; d &lt; attractDiameter : soft attraction (-0.73 px/tick at 20-25px)
        ///   - d &gt;= attractDiameter  : near equilibrium (~0 net force)
        ///
        /// No velocity impulses are applied: the original game used PBD position corrections only,
        /// and adding velocity impulses fights the kinematic velocity reset in Ship.Think, causing
        /// oscillation on spawn entry.
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
            float attractDiameter = hook.FlockAttractionDiameter > solidDiameter ? hook.FlockAttractionDiameter : solidDiameter + 8.0f;
            float attractWeight = hook.FlockAttractionWeight;
            float cohesionDistance = hook.FlockCohesionDistance;
            float cohesionWeight = hook.FlockCohesionWeight;
            int iterations = Math.Max(1, hook.FlockRelaxationIterations);

            // Global cursor-proximity fleet compression (PR #23 distScale mechanism).
            // distScale shrinks the fleet's equilibrium resting diameter when cursor is near,
            // driving ships into the attraction zone and producing visible compaction.
            float targetLen = fleet.AimTarget.Length();
            float distScale = 0.75f + 0.25f * Math.Clamp(targetLen / 200.0f, 0.0f, 1.0f);
            float effectiveSolid = solidDiameter * distScale;
            float effectiveAttract = attractDiameter * distScale;

            int count = ships.Count;

            Span<Vector2> displacements = count <= 128 ? stackalloc Vector2[count] : new Vector2[count];
            Span<float> weights = count <= 128 ? stackalloc float[count] : new float[count];

            for (int iter = 0; iter < iterations; iter++)
            {
                displacements.Clear();
                weights.Clear();

                // 1. Pairwise solid-disc repulsion + soft attraction zone pass
                for (int i = 0; i < count; i++)
                {
                    var posA = ships[i].Position;

                    for (int j = i + 1; j < count; j++)
                    {
                        var posB = ships[j].Position;
                        var rVec = posB - posA;
                        float distSq = rVec.LengthSquared();

                        if (distSq <= 0.001f)
                        {
                            // Identical-position burst dispersal (golden-angle radial spread)
                            float angle = (float)(i * 2.39996323f + j);
                            Vector2 push = new Vector2(MathF.Cos(angle), MathF.Sin(angle)) * (effectiveSolid * 0.5f * pushStiffness);
                            displacements[i] -= push;
                            displacements[j] += push;
                            weights[i] += 1f;
                            weights[j] += 1f;
                        }
                        else if (distSq < effectiveSolid * effectiveSolid)
                        {
                            // Solid-disc repulsion: ships too close, push apart
                            float dist = MathF.Sqrt(distSq);
                            float overlap = effectiveSolid - dist;
                            float smooth = 1.0f - (dist / effectiveSolid);
                            Vector2 rDir = rVec / dist;
                            Vector2 push = rDir * (overlap * 0.5f * pushStiffness * (0.5f + 0.5f * smooth));
                            displacements[i] -= push;
                            displacements[j] += push;
                            weights[i] += 1f;
                            weights[j] += 1f;
                        }
                        else if (attractWeight > 0.0001f && distSq < effectiveAttract * effectiveAttract)
                        {
                            // Soft attraction zone: ships slightly beyond solid disc pulled gently together.
                            // Matches observed -0.73 px/tick mean relative velocity at 20-25px in recordings.
                            float dist = MathF.Sqrt(distSq);
                            float penetration = dist - effectiveSolid; // how far into the attraction zone
                            float zoneWidth = effectiveAttract - effectiveSolid;
                            // Linear spring, fading to 0 at outer edge
                            float strength = penetration / zoneWidth;
                            Vector2 rDir = rVec / dist;
                            Vector2 pull = rDir * (penetration * 0.5f * attractWeight * strength);
                            displacements[i] += pull;
                            displacements[j] -= pull;
                            weights[i] += 0.5f; // lower weight to avoid over-correction
                            weights[j] += 0.5f;
                        }
                    }
                }

                // Apply accumulated pairwise displacements
                for (int i = 0; i < count; i++)
                {
                    if (weights[i] > 0.001f)
                    {
                        float invWeight = 1.0f / MathF.Max(1.0f, MathF.Sqrt(weights[i]));
                        ships[i].Position += displacements[i] * invWeight;
                    }
                }

                // 2. Soft straggler cohesion — bounds stragglers back towards fleet centroid
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
