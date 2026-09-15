namespace Game.Robots.Framework
{
    using Game.Robots.Senses;
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Numerics;
    using System.Threading.Tasks;

    public class HumanoidBot : Robot
    {
        public BotParameters Parameters { get; private set; } = new BotParameters();
        
        public VirtualCursor Cursor { get; private set; }
        
        // Sensors
        public SensorFleets SensorFleets { get; private set; }
        public SensorBullets SensorBullets { get; private set; }
        public SensorFish SensorFish { get; private set; }
        public SensorAbandoned SensorAbandoned { get; private set; }
        private List<ISense> _sensors = new List<ISense>();

        // Strategies
        private List<IStrategy> _strategies = new List<IStrategy>();
        public IStrategy ActiveStrategy { get; private set; }
        private long _lastStrategyChange = 0;
        public HumanoidBot() : base()
        {
            Name = "Galactica";
            
            Cursor = new VirtualCursor(this);
            
            _sensors.Add(SensorFleets = new SensorFleets(this));
            _sensors.Add(SensorBullets = new SensorBullets(this));
            _sensors.Add(SensorFish = new SensorFish(this));
            _sensors.Add(SensorAbandoned = new SensorAbandoned(this));

            // Load Strategies
            _strategies.Add(new Strategies.CruisingStrategy());
            _strategies.Add(new Strategies.EngageStrategy());
            // _strategies.Add(new Strategies.EscapeStrategy()); // Disabled, completely folded into EngageStrategy
            // _strategies.Add(new Strategies.SynchronousBoostStrategy()); // Disabled for now
        }

        protected override Task OnSpawnAsync()
        {
            Log("HumanoidBot Galactica spawned!");
            return base.OnSpawnAsync();
        }

        protected override Task AliveAsync()
        {
            // Reset shooting (strategies will explicitly enable it if needed this tick)
            Connection.ControlIsShooting = false;

            // 1. Update Sensors
            foreach (var sensor in _sensors)
            {
                sensor.Sense();
            }

            // 2. Evaluate Strategies
            IStrategy bestStrategy = ActiveStrategy;
            float bestUtility = ActiveStrategy?.EvaluateUtility(this) ?? -1f;

            // Hysteresis bias to prevent flickering between strategies
            float hysteresis = 0.2f; 
            
            foreach (var strategy in _strategies)
            {
                float utility = strategy.EvaluateUtility(this);
                // Apply a small penalty to non-active strategies to prevent rapid switching
                if (strategy != ActiveStrategy)
                {
                    utility -= hysteresis;
                }

                if (utility > bestUtility)
                {
                    bestUtility = utility;
                    bestStrategy = strategy;
                }
            }

            if (ActiveStrategy != bestStrategy)
            {
                ActiveStrategy = bestStrategy;
                _lastStrategyChange = GameTime;
                Log($"Strategy switched to: {bestStrategy?.GetType().Name} (Utility: {bestUtility:F2})");
            }

            // 3. Execute Strategy
            ActiveStrategy?.Execute(this);

            // Emergency Danger Zone Override: If we are already in the danger zone, steer directly to arena center
            if (MathF.Abs(Position.X) > EffectiveWorldSize || MathF.Abs(Position.Y) > EffectiveWorldSize)
            {
                Cursor.SetTarget(Vector2.Zero);
            }

            // 4. Update Virtual Cursor and apply steering
            Cursor.Update(GameTime);
            var target = Cursor.GetRelativePosition();
            SteerPointRelative(target);

            return base.AliveAsync();
        }

        public float EffectiveWorldSize => WorldSize > 0 ? (float)WorldSize : 3000f;

        public Vector2 ClampToSafePlayableArea(Vector2 worldPos, float buffer = -1f)
        {
            if (buffer < 0) buffer = Parameters.DangerZoneBuffer;
            float max = Math.Max(100f, EffectiveWorldSize - buffer);
            return new Vector2(
                Math.Clamp(worldPos.X, -max, max),
                Math.Clamp(worldPos.Y, -max, max)
            );
        }

        public bool IsNearDangerZone(float buffer = -1f)
        {
            if (buffer < 0) buffer = Parameters.DangerZoneBuffer;
            float limit = Math.Max(100f, EffectiveWorldSize - buffer);
            return MathF.Abs(Position.X) > limit || MathF.Abs(Position.Y) > limit;
        }

        public Vector2 GetDangerZoneRepulsion(float buffer = -1f)
        {
            if (buffer < 0) buffer = Parameters.DangerZoneBuffer;
            float limit = Math.Max(100f, EffectiveWorldSize - buffer);
            Vector2 repulsion = Vector2.Zero;

            if (Position.X > limit)
                repulsion.X = -(Position.X - limit);
            else if (Position.X < -limit)
                repulsion.X = (-limit - Position.X);

            if (Position.Y > limit)
                repulsion.Y = -(Position.Y - limit);
            else if (Position.Y < -limit)
                repulsion.Y = (-limit - Position.Y);

            // If in actual danger zone (|pos| > WorldSize), provide an overwhelming force towards the center
            if (MathF.Abs(Position.X) > EffectiveWorldSize || MathF.Abs(Position.Y) > EffectiveWorldSize)
            {
                var toCenter = -Position;
                if (toCenter.LengthSquared() > 0.001f)
                {
                    repulsion += Vector2.Normalize(toCenter) * 3000f;
                }
            }

            return repulsion;
        }

        public override void ShootAt(Vector2 target)
        {
            if (CanShoot)
            {
                // We bypass Robot.ShootAt to prevent it from forcefully overwriting our VirtualCursor steering
                Connection.ControlIsShooting = true;
            }
        }
    }
}
