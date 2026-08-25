namespace Game.Engine.Core
{
    public class RobotFleet : Fleet
    {
        public override float ShotCooldownTimeM { get => World.Hook.ShotCooldownTimeBotM; }
        public override float ShotCooldownTimeB { get => World.Hook.ShotCooldownTimeBotB; }
        public override float BaseThrustM { get => World.Hook.BaseThrustM; }
        public override int SpawnShipCount { get => World.Hook.BossMode ? 20 : World.Hook.SpawnShipCount; }

        public override int CalculateShotCooldown(int shipCount)
        {
            if (World.Hook.ShotCooldownTimeBotM > 0 || World.Hook.ShotCooldownTimeBotB > 0)
                return (int)(World.Hook.ShotCooldownTimeBotM * shipCount + World.Hook.ShotCooldownTimeBotB);

            return base.CalculateShotCooldown(shipCount);
        }
    }
}