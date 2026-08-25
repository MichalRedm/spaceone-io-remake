namespace Game.Robots
{
    using Game.API.Common.Models;

    public class HookComputer
    {
        public Hook Hook { get; set; }

        public float ShipThrust(int fleetSize)
        {
            return fleetSize * Hook.BaseThrustM + Hook.BaseThrustB;
        }

        public float ShotThrust(int fleetSize)
        {
            return fleetSize * Hook.ShotThrustM + Hook.ShotThrustB;
        }

        public int BulletLife(int fleetSize)
        {
            if (Hook.BulletLifeTable != null && fleetSize < Hook.BulletLifeTable.Length)
                return Hook.BulletLifeTable[fleetSize];
            return (int)(Hook.BulletLifeB + Hook.BulletLifeM * fleetSize);
        }

        public int ShotCooldown(int fleetSize)
        {
            if (Hook.ShotCooldownTimeM > 0 || Hook.ShotCooldownTimeB > 0)
                return (int)(Hook.ShotCooldownTimeM * fleetSize + Hook.ShotCooldownTimeB);

            int n = System.Math.Max(1, fleetSize);
            int stepTime = Hook.StepTime > 0 ? Hook.StepTime : 40;
            return (13 + n - (n + 4) / 10) * stepTime;
        }
    }
}
