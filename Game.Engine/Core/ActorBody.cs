namespace Game.Engine.Core
{
    using RBush;
    using System.Linq;

    public abstract class ActorBody : Body, IActor
    {
        public World World = null;

        public bool PendingDestruction { get; set; } = false;
        protected bool CausesCollisions { get; set; } = false;

        public virtual void Destroy()
        {
            if (this.Exists)
            {
                World.Actors.Remove(this);
                World.BodyRemove(this);
                this.Exists = false;
            }
        }

        public virtual void Init(World world)
        {
            World = world;
            this.ID = world.GenerateObjectID();

            world.Actors.Add(this);
            World.BodyAdd(this);

            this.OriginalPosition = this.Position;
            this.OriginalAngle = this.Angle;
            this.DefinitionTime = world.Time;
            this.Project(world.Time);

            this.Exists = true;
        }

        public virtual void Think()
        {
            if (CausesCollisions)
            {
                var searchEnvelope = new Envelope(
                    Position.X - Size,
                    Position.Y - Size,
                    Position.X + Size,
                    Position.Y + Size
                );

                var dynamicHits = World.SearchDynamic(in searchEnvelope);
                for (int i = 0; i < dynamicHits.Count; i++)
                {
                    var body = dynamicHits[i];
                    if (body != this && body is ICollide hit && hit.IsCollision(this))
                    {
                        hit.CollisionExecute(this);
                        Collided(hit);
                    }
                }

                var staticHits = World.SearchStatic(in searchEnvelope);
                for (int i = 0; i < staticHits.Count; i++)
                {
                    var body = staticHits[i];
                    if (body != this && body is ICollide hit && hit.IsCollision(this))
                    {
                        hit.CollisionExecute(this);
                        Collided(hit);
                    }
                }
            }
        }

        public virtual void CreateDestroy()
        {
            if (PendingDestruction)
            {
                PendingDestruction = false;
                Destroy();
            }
        }

        protected virtual void Collided(ICollide otherObject)
        {

        }
    }
}
