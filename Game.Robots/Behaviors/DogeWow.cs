namespace Game.Robots.Behaviors
{
    using Game.API.Client;
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Numerics;

    public class DogeWow : ContextBehavior
    {
        private IEnumerable<Body> DangerousBullets;

        public List<Vector2> ConsideredPoints { get; set; } = null;
        public int DistanceFromCenterThreshold { get; set; } = 316;

        private List<Vector2> Projections;
        public Vector2 ViewportCrop { get; set; } = new Vector2(2000 * 16f / 9f, 2000);

        public DogeWow(ContextRobot robot) : base(robot)
        {
            Normalize = false;
        }

        protected override void PreSweep(ContextRing ring)
        {
            var teamMode = Robot.HookComputer.Hook.TeamMode;

            var flets = Robot.SensorFleets.Others
                .Select(f => new { Fleet = f, Distance = Vector2.Distance(Robot.Position, f.Center) })
                .Where(p => MathF.Abs(p.Fleet.Center.X - Robot.Position.X) <= ViewportCrop.X
                    && MathF.Abs(p.Fleet.Center.Y - Robot.Position.Y) <= ViewportCrop.Y)
                .Where(p => !teamMode || p.Fleet.Color != Robot.Color)
                .OrderBy(p => p.Distance)
                .ToList();

            var PhantomProjections = new List<Vector2>();

            foreach (var flet in flets)
            {
                // Approximate the fleet as a single projection point (the center)
                PhantomProjections.Add(RoboMath.ProjectClosest(Robot.HookComputer, flet.Fleet.Center, Robot.Position, LookAheadMS, flet.Fleet.Ships.Count));
            }

            DangerousBullets = Robot.SensorBullets.VisibleBullets
                .Where(b => b.Group.Owner != Robot.FleetID)
                .Where(b => !teamMode || b.Group.Color != Robot.Color)
                .OrderBy(b => Vector2.DistanceSquared(b.Position, Robot.Position))
                .Take(100)
                .ToList();

            var bulletProjections = DangerousBullets.Select(b => b.ProjectNew(Robot.GameTime + LookAheadMS).Position).ToList();

            Projections = PhantomProjections.Concat(bulletProjections).ToList();
            ConsideredPoints = new List<Vector2>();
        }

        protected override float ScoreAngle(float angle, Vector2 position, Vector2 momentum)
        {
            float accumulator = 0f;

            var fleet = Robot.SensorFleets.MyFleet;
            var dead = 0;
            if (fleet != null)
            {
                ConsideredPoints.Add(position);

                var shipDead = 0;
                float minA = 0.0f;
                float hitd = 90.0f + (fleet.Ships.Count * 1.5f); // approximate fleet radius

                foreach (var danger in Projections)
                {
                    // Calculate distance from my projected fleet center to the danger (projected other fleet center or bullet)
                    var dist = Vector2.Distance(danger, position);
                    if (dist < DistanceFromCenterThreshold)
                    {
                        var fm = -hitd * hitd / MathF.Max(dist * dist, hitd * hitd) * (2.0f + Vector2.Dot(danger - position, new Vector2(MathF.Cos(angle), MathF.Sin(angle))) / dist);
                        minA = MathF.Min(fm, minA);
                        if (dist < hitd)
                        {
                            shipDead = 1;
                        }
                    }
                }

                dead += shipDead;
                accumulator += minA;
                
                if (fleet.Ships.Count < dead * 2 + 1)
                {
                    return accumulator * 1000.0f;
                }
            }

            return accumulator * ((float)dead + 1.0f);
        }
    }
}