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
        public OffScreenTracker OffScreenTracker { get; private set; }
        
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
            Name = "Robot";
            
            Cursor = new VirtualCursor(this);
            OffScreenTracker = new OffScreenTracker(this);
            
            _sensors.Add(SensorFleets = new SensorFleets(this));
            _sensors.Add(SensorBullets = new SensorBullets(this));
            _sensors.Add(SensorFish = new SensorFish(this));
            _sensors.Add(SensorAbandoned = new SensorAbandoned(this));

            // Load Strategies
            _strategies.Add(new Strategies.CruisingStrategy());
            _strategies.Add(new Strategies.EngageStrategy());
        }

        protected override Task OnSpawnAsync()
        {
            // Apply skill and personality variance seeded by the bot's name
            Parameters.ApplySkillLevel(Parameters.SkillLevel, Parameters.Playstyle, Name?.GetHashCode());
            OffScreenTracker.Clear();

            Log($"HumanoidBot '{Name}' spawned (Level: {Parameters.SkillLevel:F2}, Style: {Parameters.Playstyle})!");
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

            // 2. Update Off-Screen Perception Belief State
            OffScreenTracker.Update(GameTime);

            // 3. Evaluate Strategies
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
            }

            // 4. Execute Strategy
            ActiveStrategy?.Execute(this);

            // Emergency Danger Zone Override: If we are already in the danger zone, steer directly to arena center
            if (MathF.Abs(Position.X) > EffectiveWorldSize || MathF.Abs(Position.Y) > EffectiveWorldSize)
            {
                Cursor.SetTarget(Vector2.Zero);
            }

            // 5. Update Virtual Cursor and apply steering
            Cursor.Update(GameTime);
            var target = Cursor.GetRelativePosition();
            SteerPointRelative(target);

            return base.AliveAsync();
        }

        public bool IsPointInViewport(Vector2 worldPos, float margin = 0f)
        {
            var offset = worldPos - Position;
            return MathF.Abs(offset.X) <= (Parameters.ViewportWidth / 2f) + margin &&
                   MathF.Abs(offset.Y) <= (Parameters.ViewportHeight / 2f) + margin;
        }

        public float EffectiveBulletSpeed
        {
            get
            {
                var hook = HookComputer?.Hook ?? Connection?.Hook;
                int shipCount = Math.Max(1, SensorFleets.MyFleet?.Ships.Count ?? 1);
                float thrustConverter = hook?.ShotThrustConverter ?? 0.00156f;
                float shotThrust = 20f;
                if (hook?.ShotThrust != null && shipCount < hook.ShotThrust.Length)
                    shotThrust = hook.ShotThrust[shipCount];
                else
                    shotThrust = 41.00f * MathF.Pow(shipCount, -0.2633f);

                return shotThrust * thrustConverter * 10f;
            }
        }

        public Vector2? LeaderPosition
        {
            get
            {
                var entries = Leaderboard?.Entries;
                if (entries != null && entries.Count > 0)
                {
                    var first = entries[0];
                    if (first != null && first.FleetID != FleetID && first.Position != Vector2.Zero)
                    {
                        return first.Position;
                    }
                }
                return null;
            }
        }

        public uint? LeaderFleetID
        {
            get
            {
                var entries = Leaderboard?.Entries;
                if (entries != null && entries.Count > 0)
                {
                    var first = entries[0];
                    if (first != null && first.FleetID != FleetID)
                    {
                        return first.FleetID;
                    }
                }
                return null;
            }
        }

        public Vector2 ComputeHumanAimPoint(Vector2 targetPos, Vector2 targetVel)
        {
            // 1. Kinematic intercept
            var interceptPoint = InterceptionMath.CalculateInterceptPoint(Position, EffectiveBulletSpeed, targetPos, targetVel);
            
            // 2. Blend with direct target position based on skill
            var predictedAimPoint = Vector2.Lerp(targetPos, interceptPoint, Parameters.PredictiveAimFactor);

            // 3. Blend with flight direction (beginners shoot where flying)
            var myMomentum = SensorFleets.MyFleet?.Momentum ?? Vector2.Zero;
            if (Parameters.AimInFlightDirectionWeight > 0.001f && myMomentum.LengthSquared() > 0.001f)
            {
                var flightDirPoint = Position + Vector2.Normalize(myMomentum) * 600f;
                predictedAimPoint = Vector2.Lerp(predictedAimPoint, flightDirPoint, Parameters.AimInFlightDirectionWeight);
            }

            // 4. Human angular jitter / inaccuracy
            if (Parameters.AimJitter > 0.001f)
            {
                var toAim = predictedAimPoint - Position;
                float dist = toAim.Length();
                if (dist > 0.001f)
                {
                    float baseAngle = MathF.Atan2(toAim.Y, toAim.X);
                    float jitter = (float)(Random.Shared.NextDouble() * 2.0 - 1.0) * Parameters.AimJitter;
                    float jitteredAngle = baseAngle + jitter;
                    predictedAimPoint = Position + new Vector2(MathF.Cos(jitteredAngle), MathF.Sin(jitteredAngle)) * dist;
                }
            }

            return predictedAimPoint;
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
