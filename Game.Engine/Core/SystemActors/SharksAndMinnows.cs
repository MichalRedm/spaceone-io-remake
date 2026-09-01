namespace Game.Engine.Core.SystemActors
{
    using System;
    using System.Numerics;

    public class SharksAndMinnows : IActor
    {
        private World World;

        public void Init(World world)
        {
            this.World = world;
            this.World.Actors.Add(this);
        }

        public void Destroy()
        {
            this.World.Actors.Remove(this);
        }

        public void CreateDestroy() { }

        public void Think()
        {
            if (!World.Hook.SharksAndMinnowsMode)
                return;

            var players = Player.GetWorldPlayers(World);
            for (int i = 0; i < players.Count; i++)
            {
                var player = players[i];
                if (player == null || !player.IsAlive || player.Fleet == null)
                    continue;

                var fleet = player.Fleet;
                if (!fleet.Shark && !player.IsInvulnerable)
                {
                    if (MathF.Abs(fleet.FleetCenter.X) > World.Hook.WorldSize &&
                        (fleet.FleetCenter.X < 0) != fleet.LastTouchedLeft)
                    {
                        fleet.LastTouchedLeft = fleet.FleetCenter.X < 0;
                        player.IsInvulnerable = true;
                        player.SpawnTime = World.Time;
                        player.Score++;
                    }
                }
            }
        }
    }
}
