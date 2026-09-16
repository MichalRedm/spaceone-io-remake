namespace Game.Engine.Core
{
    using Game.API.Common;
    using Game.Engine.Core.Weapons;
    using System;
    using System.Numerics;

    public class Food : ActorBody, ICollide
    {
        public Food()
        {
            Size = 10;
        }

        public override void Init(World world)
        {
            World = world;
            Randomize();
            base.Init(world);
        }

        public void Randomize()
        {
            Position = World.FoodSpawner != null ? World.FoodSpawner.GetSpawnPosition() : World.RandomPosition();
            Angle = (float)Random.Shared.NextDouble() * MathF.PI * 2f;

            float baseSpeed = World.Hook.FoodSpeed;
            float speedRange = World.Hook.FoodSpeedRange;
            float speed = baseSpeed + ((float)Random.Shared.NextDouble() * 2f - 1f) * (speedRange * 0.5f);

            Momentum = new Vector2(MathF.Cos(Angle), MathF.Sin(Angle)) * speed;

            int rInt = Random.Shared.Next(0, 7);
            switch (rInt)
            {
                case 0: Sprite = Sprites.fish_red; break;
                case 1: Sprite = Sprites.fish_cyan; break;
                case 2: Sprite = Sprites.fish_blue; break;
                case 3: Sprite = Sprites.fish_green; break;
                case 4: Sprite = Sprites.fish_pink; break;
                case 5: Sprite = Sprites.fish_yellow; break;
                case 6: Sprite = Sprites.fish_orange; break;
                default: Sprite = Sprites.fish_red; break;
            }
        }

        public override void Think()
        {
            base.Think();

            // Danger zone decay / destruction
            var oob = World.DistanceOutOfBounds(Position);

            if (oob > World.Hook.OutOfBoundsDeathLine)
            {
                PendingDestruction = true;
                Destroy();
            }
        }

        public bool IsCollision(Body projectedBody)
        {
            if (PendingDestruction)
                return false;

            if (projectedBody is ShipWeaponBullet bullet)
            {
                if (bullet.Consumed)
                    return false;

                if (Vector2.Distance(projectedBody.Position, this.Position) <= this.Size + projectedBody.Size)
                    return true;
            }

            return false;
        }

        public void CollisionExecute(Body projectedBody)
        {
            if (projectedBody is ShipWeaponBullet bullet)
            {
                var fleet = bullet?.OwnedByFleet;
                bullet.Consumed = true;

                fleet?.KilledShip(null);

                PendingDestruction = true;
                Destroy();
            }
        }
    }
}
