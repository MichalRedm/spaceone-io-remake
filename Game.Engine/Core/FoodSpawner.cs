namespace Game.Engine.Core
{
    using System;
    using System.Collections.Generic;
    using System.Numerics;

    public class FoodSpawner
    {
        private readonly World World;

        public FoodSpawner(World world)
        {
            this.World = world;
        }

        public Vector2 GetSpawnPosition()
        {
            int worldSize = World.Hook.WorldSize;
            float sectorSize = MathF.Max(200f, World.Hook.FoodSectorSize);
            float arenaSpan = worldSize * 2f;

            int m = Math.Max(2, (int)MathF.Floor(arenaSpan / sectorSize));
            int totalSectors = m * m;

            // Count food per sector
            int[] counts = new int[totalSectors];
            lock (World.Bodies)
            {
                foreach (var body in World.Bodies)
                {
                    if (body is Food && body.Exists)
                    {
                        int col = (int)MathF.Floor((body.Position.X + worldSize) / arenaSpan * m);
                        int row = (int)MathF.Floor((body.Position.Y + worldSize) / arenaSpan * m);
                        col = Math.Clamp(col, 0, m - 1);
                        row = Math.Clamp(row, 0, m - 1);
                        counts[row * m + col]++;
                    }
                }
            }

            // Calculate inverse-count selection weights
            float pressure = World.Hook.FoodSelectionPressure;
            double[] weights = new double[totalSectors];
            double sumWeights = 0.0;
            for (int i = 0; i < totalSectors; i++)
            {
                double w = Math.Pow(counts[i] + 1.0, -pressure);
                weights[i] = w;
                sumWeights += w;
            }

            // Sample a sector
            double r = Random.Shared.NextDouble() * sumWeights;
            int chosenSector = 0;
            double cumulative = 0.0;
            for (int i = 0; i < totalSectors; i++)
            {
                cumulative += weights[i];
                if (r <= cumulative)
                {
                    chosenSector = i;
                    break;
                }
            }

            int chosenCol = chosenSector % m;
            int chosenRow = chosenSector / m;

            float cellW = arenaSpan / m;
            float cellH = arenaSpan / m;

            float xMin = -worldSize + chosenCol * cellW;
            float yMin = -worldSize + chosenRow * cellH;

            // Micro-positioning within the sector: select best of 3 candidate jitter positions
            Vector2 bestCandidate = Vector2.Zero;
            float maxMinDistance = -1f;

            for (int attempt = 0; attempt < 3; attempt++)
            {
                float candX = xMin + (float)Random.Shared.NextDouble() * cellW;
                float candY = yMin + (float)Random.Shared.NextDouble() * cellH;
                Vector2 candidate = new Vector2(candX, candY);

                float closestDist = float.MaxValue;
                lock (World.Bodies)
                {
                    foreach (var body in World.Bodies)
                    {
                        if (body is Food && body.Exists)
                        {
                            float d = Vector2.Distance(candidate, body.Position);
                            if (d < closestDist)
                                closestDist = d;
                        }
                    }
                }

                if (closestDist > maxMinDistance)
                {
                    maxMinDistance = closestDist;
                    bestCandidate = candidate;
                }
            }

            return bestCandidate;
        }
    }
}
