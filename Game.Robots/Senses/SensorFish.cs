namespace Game.Robots.Senses
{
    using Game.API.Common;
    using Game.Robots.Models;
    using System.Collections.Generic;
    using System.Linq;

    public class SensorFish : ISense
    {
        private readonly Robot Robot;

        public IEnumerable<Ship> AllVisibleFish => _allVisibleFish;
        private readonly List<Ship> _allVisibleFish = new List<Ship>();
        private readonly List<Ship> _shipPool = new List<Ship>();

        public SensorFish(Robot robot)
        {
            this.Robot = robot;
        }

        public void Sense()
        {
            int poolIndex = 0;
            _allVisibleFish.Clear();

            foreach (var b in Robot.Bodies)
            {
                if (b.Group?.Type == GroupTypes.Fish || b.Sprite == Sprites.fish)
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

                    _allVisibleFish.Add(s);
                    poolIndex++;
                }
            }
        }
    }
}
