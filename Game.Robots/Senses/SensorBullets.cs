namespace Game.Robots.Senses
{
    using Game.API.Client;
    using Game.API.Common;
    using System.Collections.Generic;
    using System.Linq;
    using System.Numerics;

    public class SensorBullets : ISense
    {
        private readonly Robot Robot;

        public IEnumerable<Body> VisibleBullets => _visibleBullets;
        private readonly List<Body> _visibleBullets = new List<Body>();

        public SensorBullets(Robot robot)
        {
            this.Robot = robot;
        }

        public void Sense()
        {
            _visibleBullets.Clear();
            foreach (var b in Robot.Bodies)
            {
                if (b.Group != null)
                {
                    if (b.Group.Type == GroupTypes.VolleyBullet || b.Group.Type == GroupTypes.VolleySeeker)
                    {
                        if (b.Group.Owner != Robot.FleetID)
                        {
                            _visibleBullets.Add(b);
                        }
                    }
                }
            }
        }
    }
}
