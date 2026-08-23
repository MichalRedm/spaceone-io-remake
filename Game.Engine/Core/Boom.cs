namespace Game.Engine.Core
{
    using Game.API.Common;

    public class Boom : ActorBody
    {
        public float Drag { get; set; }
        private long TimeDeath = 0;

        public override void Init(World world)
        {
            base.Init(world);

            Sprite = Sprites.boom;
            Drag = World.Hook.BoomDrag;
            TimeDeath = World.Time + World.Hook.BoomLife;
        }

        public static Boom FromShip(Ship ship)
        {
            if (ship.World.Hook.BoomLife > 0)
            {
                var boom = new Boom();
                boom.Init(ship.World);
                boom.Size = ship.Size;
                boom.Position = ship.Position;
                boom.Momentum = ship.Momentum;
                boom.Color = ship.Color;
                boom.Mode = ship.Sprite switch
                {
                    Sprites.ship_blue or Sprites.ship_ab_blue => 1,
                    Sprites.ship_cyan or Sprites.ship_ab_cyan => 2,
                    Sprites.ship_green or Sprites.ship_ab_green => 3,
                    Sprites.ship_orange or Sprites.ship_ab_orange => 4,
                    Sprites.ship_pink or Sprites.ship_ab_pink => 5,
                    Sprites.ship_red or Sprites.ship_ab_red or Sprites.ship_zed => 6,
                    Sprites.ship_yellow or Sprites.ship_ab_yellow or Sprites.ship_secret => 7,
                    _ => 2 // default to cyan
                };

                return boom;
            }
            else
                return null;
        }

        public override void Think()
        {
            base.Think();

            if (TimeDeath > 0 && World.Time > TimeDeath)
                PendingDestruction = true;

            Momentum *= Drag;
        }
    }
}
