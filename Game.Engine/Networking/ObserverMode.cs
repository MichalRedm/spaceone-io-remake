namespace Game.Engine.Networking;

/// <summary>
/// Camera and HUD tracking mode for observer/recorder connections.
/// </summary>
public enum ObserverMode
{
    /// <summary>Standard player or legacy spectator behavior.</summary>
    None = 0,
    /// <summary>Locked to a specific Player.PlayerID across deaths and respawns.</summary>
    PlayerId = 1,
    /// <summary>Locked to a player matched by fleet name across deaths and respawns.</summary>
    PlayerName = 2,
    /// <summary>Locked to a specific Fleet.ID (and its owner upon death).</summary>
    FleetId = 3,
    /// <summary>Dynamically tracks the highest-scoring alive player with hysteresis.</summary>
    Leader = 4,
    /// <summary>Follows any alive player and switches on death.</summary>
    Auto = 5,
    /// <summary>Fixed world coordinate camera.</summary>
    Point = 6
}
