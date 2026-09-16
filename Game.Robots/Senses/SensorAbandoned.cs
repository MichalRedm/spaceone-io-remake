namespace Game.Robots.Senses
{
    using Game.API.Common;
    using Game.Robots.Models;
    using System.Collections.Generic;
    using System.Linq;

    public class SensorAbandoned : ISense
    {
        private readonly Robot Robot;

        public IEnumerable<Ship> AllVisibleAbandoned => _allVisibleAbandoned;
        private readonly List<Ship> _allVisibleAbandoned = new List<Ship>();
        private readonly List<Ship> _shipPool = new List<Ship>();

        public SensorAbandoned(Robot robot)
        {
            this.Robot = robot;
        }

        public void Sense()
        {
            int poolIndex = 0;
            _allVisibleAbandoned.Clear();

            foreach (var b in Robot.Bodies)
            {
                if (b.Sprite == Sprites.ship_gray)
                {
                    Ship s;
                    if (poolIndex < _shipPool.Count)
                    {
                        s = _shipPool[poolIndex];
                    }
                    else
                    {
                        s = new Ship();
                        _shipPool.Add(s);
                    }
                    
                    s.ID = b.ID;
                    s.Angle = b.Angle;
                    s.Momentum = b.Momentum;
                    s.Position = b.Position;
                    s.Size = b.Size;

                    _allVisibleAbandoned.Add(s);
                    poolIndex++;
                }
            }
        }
    }
}
