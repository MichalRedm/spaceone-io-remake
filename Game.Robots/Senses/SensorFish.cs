namespace Game.Robots.Senses
{
    using Game.API.Common;
    using Game.Robots.Models;
    using System.Collections.Generic;

    public class SensorFish : ISense
    {
        private readonly Robot Robot;

        public IReadOnlyList<Ship> AllVisibleFish => _allVisibleFish;
        private readonly List<Ship> _allVisibleFish = new List<Ship>();
        private readonly List<Ship> _shipPool = new List<Ship>();

        public SensorFish(Robot robot)
        {
            this.Robot = robot;
        }

        public static bool IsFishSprite(Sprites sprite)
        {
            return sprite >= Sprites.fish && sprite <= Sprites.fish_yellow;
        }

        public void Sense()
        {
            int poolIndex = 0;
            _allVisibleFish.Clear();

            foreach (var b in Robot.Bodies)
            {
                if (b.Group?.Type == GroupTypes.Fish || IsFishSprite(b.Sprite))
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
                    s.Sprite = b.Sprite;
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
