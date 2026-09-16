namespace Game.Robots.Senses
{
    using Game.API.Client;
    using Game.API.Common;
    using Game.Robots.Models;
    using System.Collections.Generic;
    using System.Linq;

    public class SensorFleets : ISense
    {
        private readonly Robot Robot;

        public List<Fleet> AllVisibleFleets { get; private set; } = new List<Fleet>();
        private readonly List<Fleet> _others = new List<Fleet>();
        private readonly Dictionary<uint, Fleet> _fleetDict = new Dictionary<uint, Fleet>();
        private readonly List<Ship> _shipPool = new List<Ship>();

        public Fleet MyFleet { get; private set; }

        public SensorFleets(Robot robot)
        {
            this.Robot = robot;
        }

        public Fleet ByID(uint fleetID)
        {
            if (_fleetDict.TryGetValue(fleetID, out var fleet))
                return fleet;
            return null;
        }

        public void Sense()
        {
            foreach (var fleet in AllVisibleFleets)
            {
                fleet.PendingDestruction = true;
                fleet.Ships.Clear();
            }

            int poolIndex = 0;

            foreach (var b in Robot.Bodies)
            {
                if (b.Group?.Type == GroupTypes.Fleet)
                {
                    if (!_fleetDict.TryGetValue(b.Group.ID, out var existingFleet))
                    {
                        existingFleet = new Fleet { ID = b.Group.ID };
                        _fleetDict[b.Group.ID] = existingFleet;
                        AllVisibleFleets.Add(existingFleet);
                    }

                    existingFleet.Name = b.Group.Caption;
                    existingFleet.Sprite = b.Sprite;
                    existingFleet.Color = b.Group.Color;
                    existingFleet.PendingDestruction = false;

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
                    s.Position = b.Position;
                    s.Momentum = b.Momentum;
                    s.Size = b.Size;
                    s.Angle = b.Angle;
                    s.PendingDestruction = false;

                    existingFleet.Ships.Add(s);
                    poolIndex++;
                }
            }

            for (int i = AllVisibleFleets.Count - 1; i >= 0; i--)
            {
                var fleet = AllVisibleFleets[i];
                if (fleet.PendingDestruction)
                {
                    _fleetDict.Remove(fleet.ID);
                    AllVisibleFleets.RemoveAt(i);
                }
            }

            MyFleet = null;
            _others.Clear();
            foreach (var f in AllVisibleFleets)
            {
                f.ClearCache();
                if (f.ID == Robot.FleetID)
                    MyFleet = f;
                else
                    _others.Add(f);
            }
        }

        public IEnumerable<Fleet> Others => _others;
    }
}
