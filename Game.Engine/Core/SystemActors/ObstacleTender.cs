namespace Game.Engine.Core.SystemActors
{
    using System.Collections.Generic;

    public class ObstacleTender : IActor
    {
        private World World = null;

        private readonly List<IActor> Flock = new List<IActor>();

        public void Think()
        {
        }

        public void Init(World world)
        {
            this.World = world;
            this.World.Actors.Add(this);

            Flock.Add(new GenericTender<Obstacle>(() => World.Hook.Obstacles));
            Flock.Add(new GenericTender<Food>(() => World.Hook.Food));

            foreach (var element in Flock)
                element.Init(world);
        }

        public void Destroy()
        {
            this.World.Actors.Remove(this);

            foreach (var element in Flock)
                element.Destroy();
        }

        public void CreateDestroy()
        {
        }
    }
}