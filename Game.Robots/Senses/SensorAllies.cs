namespace Game.Robots.Senses
{
    using Game.API.Common;
    using Game.Robots.Models;
    using System.Collections.Generic;
    using System.Linq;

    public class SensorAllies : ISense
    {
        private readonly Robot Robot;
        public List<string> AlliedNames = new List<string>();
        public bool HasAllies { get => AlliedNames?.Any() ?? false; }

        public SensorAllies(Robot robot)
        {
            this.Robot = robot;
        }

        public void Sense()
        {
        }

        public bool IsAlly(Fleet fleet)
        {
            if (AlliedNames.Any() && AlliedNames.Contains(fleet.Name))
                return true;

            return false;
        }

        public bool IsAlly(Leaderboard.Entry entry)
        {
            if (AlliedNames.Any() && AlliedNames.Contains(entry.Name))
                return true;

            return false;
        }
    }
}
