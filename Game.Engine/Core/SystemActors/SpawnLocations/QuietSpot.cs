namespace Game.Engine.Core.SystemActors
{
    using System.Collections.Generic;
    using System.Linq;
    using System.Numerics;

    public static class QuietSpot
    {
        public static Vector2 GeneratorQuietSpot(Fleet fleet)
        {
            const int POINTS_TO_TEST = 15;
            const int SEARCH_RADIUS = 2500;

            var world = fleet.World;
            var bestPoint = world.RandomPosition();
            var bestDistance = -1f;

            for (var i = 0; i < POINTS_TO_TEST; i++)
            {
                var candidate = world.RandomPosition();
                var closeBodies = world.BodiesNear(candidate, SEARCH_RADIUS);

                var minDistance = float.MaxValue;
                foreach (var body in closeBodies)
                {
                    if (body is Ship)
                    {
                        var d = Vector2.Distance(body.Position, candidate);
                        if (d < minDistance)
                        {
                            minDistance = d;
                        }
                    }
                }

                // If candidate has no ships within SEARCH_RADIUS, it is already an optimal quiet spot
                if (minDistance >= SEARCH_RADIUS)
                    return candidate;

                if (minDistance > bestDistance)
                {
                    bestDistance = minDistance;
                    bestPoint = candidate;
                }
            }

            return bestPoint;
        }
    }
}