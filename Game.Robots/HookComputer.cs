namespace Game.Robots
{
    using Game.API.Common.Models;

    public class HookComputer
    {
        public Hook Hook { get; set; }

        public float ShipThrust(int fleetSize)
        {
            int size = System.Math.Max(1, fleetSize);
            if (Hook.BaseThrust != null && size < Hook.BaseThrust.Length)
                return Hook.BaseThrust[size] * Hook.BaseThrustConverter;
            return (13.60f * System.MathF.Pow(size, -0.2072f)) * Hook.BaseThrustConverter;
        }

        public float ShotThrust(int fleetSize)
        {
            int size = System.Math.Max(1, fleetSize);
            if (Hook.ShotThrust != null && size < Hook.ShotThrust.Length)
                return Hook.ShotThrust[size] * Hook.ShotThrustConverter;
            return (41.00f * System.MathF.Pow(size, -0.2633f)) * Hook.ShotThrustConverter;
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
