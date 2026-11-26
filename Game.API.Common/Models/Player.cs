namespace Game.API.Common.Models
{
    public class GameConnection
    {
        public string PlayerID { get; set; }
        public uint FleetID { get; set; }
        public int FleetSize { get; set; }
        public string Name { get; set; }
        public string Color { get; set; }
        public string IP { get; set; }
        public int Score { get; set; }
        public bool IsAlive { get; set; }
        public bool IsBot { get; set; }
        public bool IsSpectating { get; set; }
        public bool IsObserver { get; set; }
        public float PositionX { get; set; }
        public float PositionY { get; set; }
        public int KillCount { get; set; }
        public int DeathCount { get; set; }

        public bool Backgrounded { get; set; }
        public uint ClientFPS { get; set; }
        public uint ClientVPS { get; set; }
        public uint ClientUPS { get; set; }
        public uint ClientCS { get; set; }
        public uint Bandwidth { get; set; }
        public uint Latency { get; set; }
    }
}
