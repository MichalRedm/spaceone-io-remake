namespace Game.Robots.Senses
{
    using Game.API.Client;
    using Game.API.Common;
    using Game.Robots.Models;
    using System.Collections.Generic;

    public class SensorFleets : ISense
    {
        private readonly Robot Robot;

        public List<Fleet> AllVisibleFleets { get; private set; } = new List<Fleet>();
        private readonly List<Fleet> _others = new List<Fleet>();

        public Fleet MyFleet { get; private set; }

        public SensorFleets(Robot robot)
        {
            this.Robot = robot;
        }

        public Fleet ByID(uint fleetID)
        {
            foreach (var f in AllVisibleFleets)
                if (f.ID == fleetID) return f;
            return null;
        }

        public void Sense()
        {
            foreach (var fleet in AllVisibleFleets)
            {
                fleet.PendingDestruction = true;
                foreach (var ship in fleet.Ships)
                    ship.PendingDestruction = true;
            }

            foreach (var b in Robot.Bodies)
            {
                if (b.Group?.Type == GroupTypes.Fleet)
                {
                    Fleet existingFleet = null;
                    foreach (var f in AllVisibleFleets)
                    {
                        if (f.ID == b.Group.ID)
                        {
                            existingFleet = f;
                            break;
                        }
                    }

                    if (existingFleet == null)
                    {
                        existingFleet = new Fleet { ID = b.Group.ID };
                        AllVisibleFleets.Add(existingFleet);
                    }

                    existingFleet.Name = b.Group.Caption;
                    existingFleet.Sprite = b.Sprite;
                    existingFleet.Color = b.Group.Color;
                    existingFleet.PendingDestruction = false;

                    Ship existingShip = null;
                    foreach (var s in existingFleet.Ships)
                    {
                        if (s.ID == b.ID)
                        {
                            existingShip = s;
                            break;
                        }
                    }

                    if (existingShip == null)
                    {
                        existingShip = new Ship { ID = b.ID };
                        existingFleet.Ships.Add(existingShip);
                    }

                    existingShip.Position = b.Position;
                    existingShip.Momentum = b.Momentum;
                    existingShip.Size = b.Size;
                    existingShip.Angle = b.Angle;
                    existingShip.PendingDestruction = false;
                }
            }

            for (int i = AllVisibleFleets.Count - 1; i >= 0; i--)
            {
                var fleet = AllVisibleFleets[i];
                if (fleet.PendingDestruction)
                {
                    AllVisibleFleets.RemoveAt(i);
                }
                else
                {
                    for (int j = fleet.Ships.Count - 1; j >= 0; j--)
                    {
                        if (fleet.Ships[j].PendingDestruction)
                        {
                            fleet.Ships.RemoveAt(j);
                        }
                    }
                }
            }

            MyFleet = null;
            _others.Clear();
            foreach (var f in AllVisibleFleets)
            {
                if (f.ID == Robot.FleetID)
                    MyFleet = f;
                else
                    _others.Add(f);
            }
        }

        public IEnumerable<Fleet> Others => _others;
    }
}
