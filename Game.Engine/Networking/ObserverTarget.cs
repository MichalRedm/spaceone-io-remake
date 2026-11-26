namespace Game.Engine.Networking;

using System;
using System.Globalization;
using System.Numerics;

/// <summary>
/// Parsed observer tracking specification sent over <c>NetControlInput.SpectateControl</c>.
/// </summary>
public sealed class ObserverTarget
{
    /// <summary>Default spatial query half-extent around the tracked camera in world units.</summary>
    public const int DefaultViewportRadius = 2000;

    /// <summary>Minimum allowed observer spatial query half-extent in world units.</summary>
    public const int MinViewportRadius = 1000;

    /// <summary>Maximum allowed observer spatial query half-extent in world units.</summary>
    public const int MaxViewportRadius = 6000;

    /// <summary>Active observer tracking mode.</summary>
    public ObserverMode Mode { get; init; } = ObserverMode.None;

    /// <summary>Target identifier string (PlayerID prefix or player name) depending on <see cref="Mode"/>.</summary>
    public string TargetValue { get; init; }

    /// <summary>Target fleet identifier when <see cref="Mode"/> is <see cref="ObserverMode.FleetId"/>.</summary>
    public uint TargetFleetId { get; init; }

    /// <summary>Fixed world coordinate when <see cref="Mode"/> is <see cref="ObserverMode.Point"/>.</summary>
    public Vector2 Point { get; init; } = Vector2.Zero;

    /// <summary>
    /// When true and tracking a specific player, mirrors their alive state, FleetID,
    /// cooldown meters, and non-destructive announcements for exact POV parity.
    /// </summary>
    public bool MirrorPov { get; init; }

    /// <summary>Half-extent (in world units) of the spatial query envelope around the camera.</summary>
    public int ViewportRadius { get; init; } = DefaultViewportRadius;

    /// <summary>
    /// Parses an <c>observe:&lt;spec&gt;</c> command string into an <see cref="ObserverTarget"/>.
    /// Returns <see langword="false"/> if the command is not an observer command or is malformed.
    /// </summary>
    public static bool TryParse(string spectateControl, out ObserverTarget target)
    {
        target = null;
        if (string.IsNullOrWhiteSpace(spectateControl)
            || !spectateControl.StartsWith("observe:", StringComparison.Ordinal))
        {
            return false;
        }

        string body = spectateControl.Substring("observe:".Length);
        string[] segments = body.Split(';', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 0)
            return false;

        string main = segments[0];
        ObserverMode mode = ObserverMode.None;
        string targetValue = null;
        uint targetFleetId = 0;
        Vector2 point = Vector2.Zero;
        bool defaultPov = false;

        if (main.StartsWith("player:", StringComparison.Ordinal))
        {
            string id = main.Substring("player:".Length).Trim();
            if (string.IsNullOrEmpty(id))
                return false;

            mode = ObserverMode.PlayerId;
            targetValue = id;
            defaultPov = true;
        }
        else if (main.StartsWith("name:", StringComparison.Ordinal))
        {
            string encodedName = main.Substring("name:".Length);
            string decodedName = Uri.UnescapeDataString(encodedName).Trim();
            if (string.IsNullOrEmpty(decodedName))
                return false;

            mode = ObserverMode.PlayerName;
            targetValue = decodedName;
            defaultPov = true;
        }
        else if (main.StartsWith("fleet:", StringComparison.Ordinal))
        {
            string fleetText = main.Substring("fleet:".Length).Trim();
            if (!uint.TryParse(fleetText, NumberStyles.Integer, CultureInfo.InvariantCulture, out targetFleetId)
                || targetFleetId == 0)
            {
                return false;
            }

            mode = ObserverMode.FleetId;
            defaultPov = true;
        }
        else if (string.Equals(main, "leader", StringComparison.Ordinal))
        {
            mode = ObserverMode.Leader;
        }
        else if (string.Equals(main, "auto", StringComparison.Ordinal))
        {
            mode = ObserverMode.Auto;
        }
        else if (main.StartsWith("point:", StringComparison.Ordinal))
        {
            string coordsText = main.Substring("point:".Length);
            string[] xy = coordsText.Split(',', StringSplitOptions.TrimEntries);
            if (xy.Length != 2
                || !float.TryParse(xy[0], NumberStyles.Float, CultureInfo.InvariantCulture, out float x)
                || !float.TryParse(xy[1], NumberStyles.Float, CultureInfo.InvariantCulture, out float y)
                || float.IsNaN(x) || float.IsInfinity(x)
                || float.IsNaN(y) || float.IsInfinity(y))
            {
                return false;
            }

            mode = ObserverMode.Point;
            point = new Vector2(x, y);
        }
        else
        {
            return false;
        }

        bool mirrorPov = defaultPov;
        int radius = DefaultViewportRadius;

        for (int i = 1; i < segments.Length; i++)
        {
            string opt = segments[i];
            if (opt.StartsWith("pov=", StringComparison.Ordinal))
            {
                string val = opt.Substring("pov=".Length);
                if (val == "1" || string.Equals(val, "true", StringComparison.OrdinalIgnoreCase))
                    mirrorPov = mode != ObserverMode.Point;
                else if (val == "0" || string.Equals(val, "false", StringComparison.OrdinalIgnoreCase))
                    mirrorPov = false;
            }
            else if (opt.StartsWith("radius=", StringComparison.Ordinal))
            {
                if (int.TryParse(opt.Substring("radius=".Length), NumberStyles.Integer, CultureInfo.InvariantCulture, out int parsedRadius))
                    radius = Math.Clamp(parsedRadius, MinViewportRadius, MaxViewportRadius);
            }
        }

        target = new ObserverTarget
        {
            Mode = mode,
            TargetValue = targetValue,
            TargetFleetId = targetFleetId,
            Point = point,
            MirrorPov = mirrorPov,
            ViewportRadius = radius
        };
        return true;
    }
}
