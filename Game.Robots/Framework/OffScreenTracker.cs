namespace Game.Robots.Framework
{
    using Game.API.Common;
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Numerics;

    public class TrackedEnemy
    {
        public uint FleetID { get; set; }
        public Vector2 EstimatedPosition { get; set; }
        public Vector2 EstimatedVelocity { get; set; }
        public long LastSeenTime { get; set; }
        public float Certainty { get; set; } = 1.0f; // 1.0 = in direct sight, decays towards 0 off-screen
        public bool IsDirectlyVisible { get; set; } = true;
        public int ShipCount { get; set; } = 1;
        public string Name { get; set; }
        public Sprites Sprite { get; set; }
        public string Color { get; set; }
    }

    public class OffScreenTracker
    {
        private readonly HumanoidBot _bot;
        private readonly Dictionary<uint, TrackedEnemy> _tracked = new Dictionary<uint, TrackedEnemy>();
        private long _lastUpdateTime = 0;

        public IEnumerable<TrackedEnemy> TrackedEnemies => _tracked.Values;

        public OffScreenTracker(HumanoidBot bot)
        {
            _bot = bot;
        }

        public TrackedEnemy Get(uint fleetID)
        {
            _tracked.TryGetValue(fleetID, out var enemy);
            return enemy;
        }

        public void Update(long gameTime)
        {
            float dt = _lastUpdateTime == 0 ? 0f : (gameTime - _lastUpdateTime);
            _lastUpdateTime = gameTime;

            var activeFleetIds = new HashSet<uint>();

            // 1. Direct sensory updates for enemies currently on radar/screen
            foreach (var enemy in _bot.SensorFleets.Others)
            {
                activeFleetIds.Add(enemy.ID);
                bool inViewport = _bot.IsPointInViewport(enemy.Center, margin: 120f);

                if (inViewport)
                {
                    if (!_tracked.TryGetValue(enemy.ID, out var tracked))
                    {
                        tracked = new TrackedEnemy { FleetID = enemy.ID };
                        _tracked[enemy.ID] = tracked;
                    }

                    tracked.EstimatedPosition = enemy.Center;
                    tracked.EstimatedVelocity = enemy.Momentum;
                    tracked.Certainty = 1.0f;
                    tracked.LastSeenTime = gameTime;
                    tracked.IsDirectlyVisible = true;
                    tracked.ShipCount = enemy.Ships.Count;
                    tracked.Name = enemy.Name;
                    tracked.Sprite = enemy.Sprite;
                    tracked.Color = enemy.Color;
                }
                else if (_tracked.TryGetValue(enemy.ID, out var tracked))
                {
                    // Was seen previously, but now outside direct viewport
                    tracked.IsDirectlyVisible = false;
                    if (dt > 0)
                    {
                        tracked.EstimatedPosition += tracked.EstimatedVelocity * dt;
                        tracked.EstimatedPosition = _bot.ClampToSafePlayableArea(tracked.EstimatedPosition);
                    }

                    long age = gameTime - tracked.LastSeenTime;
                    if (_bot.Parameters.OffscreenMemoryDurationMs <= 0)
                    {
                        tracked.Certainty = 0f;
                    }
                    else
                    {
                        tracked.Certainty = Math.Max(0f, 1.0f - ((float)age / _bot.Parameters.OffscreenMemoryDurationMs));
                    }
                }
            }

            // 2. Incoming bullet backtracking for off-screen attackers
            if (_bot.Parameters.TracksOffscreenBullets)
            {
                var bullets = _bot.SensorBullets.VisibleBullets;
                foreach (var b in bullets)
                {
                    if (b.Group == null || b.Group.Owner == _bot.FleetID || b.Group.Owner == 0)
                        continue;

                    uint ownerId = b.Group.Owner;

                    // If shooter is already directly visible on screen, we don't need to guess
                    if (_tracked.TryGetValue(ownerId, out var existing) && existing.IsDirectlyVisible)
                        continue;

                    if (b.Momentum.LengthSquared() > 0.001f)
                    {
                        var dir = Vector2.Normalize(b.Momentum);
                        // Backtrack bullet trajectory to estimate firing location
                        var estimatedOrigin = b.Position - dir * 750f;
                        estimatedOrigin = _bot.ClampToSafePlayableArea(estimatedOrigin);

                        if (existing != null)
                        {
                            existing.EstimatedPosition = Vector2.Lerp(existing.EstimatedPosition, estimatedOrigin, 0.4f);
                            existing.Certainty = Math.Max(existing.Certainty, 0.8f);
                            existing.LastSeenTime = gameTime;
                            existing.IsDirectlyVisible = false;
                        }
                        else
                        {
                            _tracked[ownerId] = new TrackedEnemy
                            {
                                FleetID = ownerId,
                                EstimatedPosition = estimatedOrigin,
                                EstimatedVelocity = -dir * 0.2f, // Guess they might be drifting backwards/recoiling
                                Certainty = 0.7f,
                                LastSeenTime = gameTime,
                                IsDirectlyVisible = false,
                                ShipCount = 10
                            };
                        }
                    }
                }
            }

            // 3. Prune expired or non-existent tracked enemies
            var toRemove = new List<uint>();
            foreach (var kvp in _tracked)
            {
                var enemy = kvp.Value;
                long age = gameTime - enemy.LastSeenTime;

                if (enemy.Certainty <= 0.01f || age > _bot.Parameters.OffscreenMemoryDurationMs)
                {
                    toRemove.Add(kvp.Key);
                }
            }

            foreach (var id in toRemove)
            {
                _tracked.Remove(id);
            }
        }

        public void Clear()
        {
            _tracked.Clear();
            _lastUpdateTime = 0;
        }
    }
}
