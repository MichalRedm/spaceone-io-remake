namespace Game.Engine.Core
{
    using Game.API.Common;
    using Game.Engine.Core.Steering;
    using Game.Engine.Core.Weapons;
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Numerics;

    public class Fleet : ActorGroup
    {
        public virtual int CalculateShotCooldown(int shipCount)
        {
            int n = Math.Max(1, shipCount);
            return (13 + n - (n + 4) / 10) * World.Hook.StepTime;
        }
        public virtual float[] BaseThrust { get => World.Hook.BaseThrust; }
        public virtual float BaseThrustConverter { get => World.Hook.BaseThrustConverter; }

        public virtual int SpawnShipCount { get => World.Hook.SpawnShipCount; }

        public Player Owner { get; set; }

        public bool BoostRequested { get; set; }
        public bool ShootRequested { get; set; }

        public long ShootCooldownTimeStart { get; set; } = 0;
        public long ShootCooldownTime { get; set; } = 0;
        public float ShootCooldownStatus { get; set; } = 0;
        public long BoostCooldownTimeStart { get; set; } = 0;
        public long BoostCooldownTime { get; set; } = 0;
        public float BoostCooldownStatus { get; set; } = 0;
        public long BoostUntil { get; set; } = 0;
        public long BoostUntil2 { get; set; } = 0;
        public long BoostStartTime { get; set; } = 0;
        public float BoostAngle { get; set; } = 0;
        public float FleetAngle { get; set; } = 0;
        public float FleetTurnSign { get; set; } = 1.0f;

        public Vector2 AimTarget { get; set; }

        public List<Ship> Ships { get; set; } = new List<Ship>();
        public List<Ship> NewShips { get; set; } = new List<Ship>();

        public List<ShipWeaponBullet> NewBullets { get; set; } = new List<ShipWeaponBullet>();

        public IFleetWeapon BaseWeapon { get; set; }

        public Vector2 FleetCenter = Vector2.Zero;
        public Vector2 FleetMomentum = Vector2.Zero;

        public float Burden { get; set; } = 0f;
        public bool FiringWeapon { get; private set; } = false;
        
        public uint DangerSince { get; set; } = 0;
        public uint DangerDecayCounter { get; set; } = 0;
        public uint NextDecayTime { get; set; } = 0;
        
        public uint ShipGainCounter { get; set; } = 0;

        public Vector2? SpawnLocation { get; set; } = null;
        public int ShipSize { get; set; } = 10;

        public Queue<long> EarnedShips = new Queue<long>();

        [Flags]
        public enum ShipModeEnum
        {
            none = 0,
            boost = 1,
            invulnerable = 2,
            defense_upgrade = 4,
            offense_upgrade = 8,
            shield = 16
        }

        public Sprites BulletSprite
        {
            get
            {
                switch (Owner.ShipSprite)
                {
                    case Sprites.ship_cyan: return Sprites.bullet_cyan;
                    case Sprites.ship_blue: return Sprites.bullet_blue;
                    case Sprites.ship_green: return Sprites.bullet_green;
                    case Sprites.ship_orange: return Sprites.bullet_orange;
                    case Sprites.ship_pink: return Sprites.bullet_pink;
                    case Sprites.ship_red: return Sprites.bullet_red;
                    case Sprites.ship_yellow: return Sprites.bullet_yellow;
                    case Sprites.ship_zed: return Sprites.bullet_red;
                    default: return Sprites.bullet;
                }
            }
        }

        private void Die(Player player)
        {
            World.Scoring.FleetDied(player, Owner, this);

            this.Owner.Die(player);

            PendingDestruction = true;
            NewShips.Clear();
        }

        public override void Destroy()
        {
            foreach (var ship in Ships.ToList())
                ship.Destroy();

            base.Destroy();
        }

        public void ShipDeath(Player player, Ship ship, ShipWeaponBullet bullet)
        {
            this.Owner.LastShipDeathKiller = bullet?.OwnedByFleet?.Owner;
            this.Owner.LastShipDeathTime = World.Time;

            bool anyAlive = false;
            for (int i = 0; i < Ships.Count; i++)
            {
                if (!Ships[i].PendingDestruction)
                {
                    anyAlive = true;
                    break;
                }
            }

            if (!anyAlive)
            {
                if (ship != null)
                    this.FleetCenter = ship.Position;
                Die(player);
            }
        }

        public void KilledShip(Ship killedShip)
        {
            uint threshold;
            if (Ships.Count <= 30) {
                threshold = 1;
            } else if (Ships.Count <= 60) {
                threshold = 2;
            } else if (Ships.Count <= 80) {
                threshold = 3;
            } else if (Ships.Count <= 90) {
                threshold = 4;
            } else if (Ships.Count <= 99) {
                threshold = 5;
            } else {
                threshold = 0;
            }
            this.ShipGainCounter += 1;
            if (threshold <= this.ShipGainCounter)
                if (Ships != null && Ships.Count > 0
                  && Ships.Count <= 99
                  && !(this.Owner.LastShipDeathKiller == killedShip?.Fleet?.Owner
                  && World.Time - this.Owner.LastShipDeathTime <= World.Hook.MutualDestructionCooldown))
                {
                    EarnedShips.Enqueue(World.Time + World.Hook.EarnedShipDelay);
                    this.ShipGainCounter = 0;
                }
        }

        public void AddShip(Sprites? sprite = null)
        {
            if (!this.Owner.IsAlive || this.PendingDestruction)
                return;

            var offset = new Vector2
            (
                Random.Shared.Next(-World.Hook.ShipAddRadius, World.Hook.ShipAddRadius),
                Random.Shared.Next(-World.Hook.ShipAddRadius, World.Hook.ShipAddRadius)
            );

            var ship = new Ship()
            {
                Fleet = this,
                Sprite = this.Owner.ShipSprite,
                Color = this.Owner.Color,
                Size = ShipSize
            };

            if (this.Ships.Count > 0)
            {
                var position = Vector2.Zero;
                var momentum = Vector2.Zero;
                var angle = 0f;
                var count = 0;

                foreach (var existingShip in this.Ships)
                {
                    position += existingShip.Position;
                    momentum += existingShip.Momentum;
                    angle += existingShip.Angle;
                    count++;
                }

                ship.Position = position / count + offset;
                ship.Momentum = momentum / count * World.Hook.ShipAddMomentumMultiplier;
                ship.Angle = angle / count;
            }
            else
            {
                ship.Position = FleetCenter + offset;
            }

            NewShips.Add(ship);
        }

        public override void Init(World world)
        {
            base.Init(world);
            this.GroupType = GroupTypes.Fleet;
            this.ZIndex = 200;

            this.BaseWeapon = new FleetWeaponGeneric<ShipWeaponBullet>();

            if (SpawnLocation != null)
                FleetCenter = SpawnLocation.Value;
            else
                FleetCenter = world.RandomSpawnPosition(this);

            for (int i = 0; i < SpawnShipCount; i++)
                this.AddShip();
        }

        public override void CreateDestroy()
        {
            if (FiringWeapon)
            {
                BaseWeapon.FireFrom(this);
                FiringWeapon = false;
            }

            while (EarnedShips.Count > 0 && EarnedShips.Peek() < World.Time)
            {
                AddShip();
                EarnedShips.Dequeue();
            }

            foreach (var ship in NewShips)
            {
                ship.Init(World);
                Ships.Add(ship);
            }
            NewShips.Clear();

            foreach (var bullet in NewBullets)
                bullet.Init(World);

            NewBullets.Clear();

            base.CreateDestroy();
        }

        public void Abandon()
        {
            while (Ships.Count > 0)
                this.AbandonShip(Ships[Ships.Count - 1]);
        }

        public void AbandonShip(Ship ship)
        {
            ship.Fleet = null;
            switch (Owner.ShipSprite)
            {
                case Sprites.ship_cyan: ship.Sprite = Sprites.ship_ab_cyan; break;
                case Sprites.ship_blue: ship.Sprite = Sprites.ship_ab_blue; break;
                case Sprites.ship_green: ship.Sprite = Sprites.ship_ab_green; break;
                case Sprites.ship_orange: ship.Sprite = Sprites.ship_ab_orange; break;
                case Sprites.ship_pink: ship.Sprite = Sprites.ship_ab_pink; break;
                case Sprites.ship_red: ship.Sprite = Sprites.ship_ab_red; break;
                case Sprites.ship_yellow: ship.Sprite = Sprites.ship_ab_yellow; break;
                case Sprites.ship_zed: ship.Sprite = Sprites.ship_ab_red; break;
                default: ship.Sprite = Sprites.ship_gray; break;
            }
            ship.Color = "gray";
            ship.Abandoned = true;

            // Apply slight random translational velocity noise and angular spin noise to each abandoned ship
            if (World.Hook.AbandonNoiseVelocity > 0)
            {
                float noiseAngle = (float)Random.Shared.NextDouble() * MathF.PI * 2f;
                float noiseSpeed = (float)Random.Shared.NextDouble() * World.Hook.AbandonNoiseVelocity;
                ship.Momentum += new Vector2(MathF.Cos(noiseAngle), MathF.Sin(noiseAngle)) * noiseSpeed;
            }

            if (World.Hook.AbandonNoiseRotation > 0)
            {
                float sign = Random.Shared.NextDouble() > 0.5 ? 1f : -1f;
                // Bimodal distribution: guaranteed minimum spin of 25% max, matching original cp5::random() * 0.015 + 0.005 formula
                float magnitude = 0.25f * World.Hook.AbandonNoiseRotation + 0.75f * (float)Random.Shared.NextDouble() * World.Hook.AbandonNoiseRotation;
                ship.AngularVelocity = sign * magnitude;
            }

            ship.Group = null;
            ship.ThrustAmount = 0;
            ship.Mode = 0;
            ship.AbandonedByFleet = this;
            ship.AbandonedTime = World.Time;

            if (Ships.Contains(ship))
                Ships.Remove(ship);
        }

        public override void Think()
        {
            bool isShooting = ShootRequested && World.Time >= ShootCooldownTime;
            bool isBoosting = World.Time < BoostUntil;
            bool isBoosting2 = World.Time < BoostUntil2;
            bool isBoostInitial = false;
            float targetLen = AimTarget.Length();

            if (World.Time > BoostCooldownTime && BoostRequested && Ships.Count > 1)
            {
                BoostCooldownTime = World.Time + (long)
                    (World.Hook.BoostCooldownTimeM * Ships.Count + World.Hook.BoostCooldownTimeB);
                BoostCooldownTimeStart = World.Time;

                BoostUntil = World.Time + World.Hook.BoostDuration;
                BoostUntil2 = World.Time + World.Hook.BoostDuration2;
                BoostStartTime = World.Time;

                Vector2 BoostVector = new Vector2(0, 0);
                foreach (var ship in Ships) {
                    BoostVector += ship.Momentum;
                }
                BoostVector = Vector2.Normalize(Vector2.Normalize(BoostVector) + Vector2.Multiply(AimTarget, (Single)0.75));

                BoostAngle = MathF.Atan2(BoostVector.Y, BoostVector.X);
                isBoostInitial = true;
                var shipLoss = (int)MathF.Floor(Ships.Count / 2);
                var Sorter = Ships.OrderByDescending((ship) => Vector2.DistanceSquared(FleetCenter + AimTarget, ship.Position)).Take(shipLoss);
                foreach (Ship ship in Sorter)
                {
                    AbandonShip(ship);
                }
            }

            FleetCenter = FleetMath.FleetCenterNaive(this.Ships);
            FleetMomentum = FleetMath.FleetMomentum(this.Ships);

            Flocking.Relaxation(this);

            float angle = MathF.Atan2(AimTarget.Y, AimTarget.X);
            float BoostM = (float)Math.Pow(Ships.Count, -0.205); // 4D Klein Manifold's magical formula

            if (targetLen > 0.001f)
            {
                // Wrapped angular difference between fleet target and authoritative fleet direction
                float fleetAngleDiff = (angle - FleetAngle + MathF.PI) % (MathF.PI * 2f);
                if (fleetAngleDiff < 0) fleetAngleDiff += MathF.PI * 2f;
                fleetAngleDiff -= MathF.PI;

                // Update authoritative fleet turn direction sign (+1.0 = CCW, -1.0 = CW)
                if (MathF.Abs(fleetAngleDiff) > 0.001f)
                {
                    FleetTurnSign = fleetAngleDiff >= 0 ? 1.0f : -1.0f;
                }

                // Advance FleetAngle smoothly towards target
                float fleetMaxTurnRate = isBoosting ? World.Hook.BoostTurnRate : World.Hook.TurnRate;
                float clampedFleetDelta = Math.Clamp(fleetAngleDiff, -fleetMaxTurnRate, fleetMaxTurnRate);
                FleetAngle += clampedFleetDelta;
            }
            else if (FleetMomentum.LengthSquared() > 0.001f)
            {
                FleetAngle = MathF.Atan2(FleetMomentum.Y, FleetMomentum.X);
            }

            // Minimal, smooth mouse convergence: ships steer towards the mouse cursor
            // with a bounded convergence angle (max ~3.5 deg = 0.06 rad).
            // Smoothly fade to 0 when cursor is within 30-100px of fleet center to eliminate radial divergence when passing through the fleet
            float maxConvergenceAngle = 0.06f * Math.Clamp((targetLen - 30.0f) / 70.0f, 0.0f, 1.0f);
            Vector2 mousePos = FleetCenter + AimTarget;

            foreach (var ship in Ships)
            {
                // Align ship visual facing angle with aim target or velocity
                if (targetLen > 0.001f)
                    ship.Angle = angle;
                else if (ship.Momentum.Length() > 0.001f)
                    ship.Angle = MathF.Atan2(ship.Momentum.Y, ship.Momentum.X);

                if (targetLen > 0.001f)
                {
                    if (maxConvergenceAngle > 0.001f)
                    {
                        Vector2 toMouse = mousePos - ship.Position;
                        float rawAngle = MathF.Atan2(toMouse.Y, toMouse.X);
                        float angleDiff = (rawAngle - angle + MathF.PI) % (MathF.PI * 2f);
                        if (angleDiff < 0) angleDiff += MathF.PI * 2f;
                        angleDiff -= MathF.PI;

                        float clampedDiff = Math.Clamp(angleDiff, -maxConvergenceAngle, maxConvergenceAngle);
                        ship.AngleMovement = angle + clampedDiff;
                    }
                    else
                    {
                        ship.AngleMovement = angle;
                    }
                }
                else if (ship.Momentum.Length() > 0.001f)
                {
                    ship.AngleMovement = MathF.Atan2(ship.Momentum.Y, ship.Momentum.X);
                }

                float baseThrust = (BaseThrust[Ships.Count] * BaseThrustConverter);
                ship.ThrustAmount = baseThrust * (1 - Burden);

                ship.Mode = (byte)
                    (
                        (isBoosting ? ShipModeEnum.boost : ShipModeEnum.none)
                        | (Owner.IsInvulnerable ? ShipModeEnum.invulnerable : ShipModeEnum.none)
                    );

                if (isBoostInitial)
                    if (ship.Momentum != Vector2.Zero)
                        ship.Momentum += Vector2.Normalize(FleetMomentum) * World.Hook.BoostSpeed * BoostM;
            }

            // Authoritative Fleet Out-of-Bounds Evaluation
            var oob = World.DistanceOutOfBounds(FleetCenter);
            if (oob > 0)
            {
                if (DangerSince == 0)
                {
                    DangerSince = World.Time;
                    NextDecayTime = World.Time + World.Hook.OutOfBoundsDecayStart;
                }

                // Hard outer death boundary: if the fleet centroid exceeds the outer death line,
                // ships suffer rapid fatal destruction
                if (World.Hook.OutOfBoundsDeathLine > 0 && oob >= World.Hook.OutOfBoundsDeathLine)
                {
                    if (Ships.Count > 0)
                    {
                        Ships[0]?.Die(null, null, null);
                        DangerDecayCounter++;
                    }
                }
                else if (NextDecayTime != 0 && World.Time >= NextDecayTime)
                {
                    if (Ships.Count > 0)
                    {
                        // FIFO decay: the oldest joined ship (Ships[0]) decays first, matching original Spaceone telemetry
                        Ships[0]?.Die(null, null, null);
                        DangerDecayCounter++;
                    }

                    // Dynamic decay interval: inversely proportional to penetration depth into danger zone
                    float dangerWidth = World.Hook.OutOfBoundsDeathLine > 0 ? World.Hook.OutOfBoundsDeathLine : 750f;
                    float u = Math.Clamp(oob / dangerWidth, 0f, 1f);

                    float minInterval = World.Hook.OutOfBoundsDecayIntervalMin > 0 ? World.Hook.OutOfBoundsDecayIntervalMin : 300f;
                    float maxInterval = World.Hook.OutOfBoundsDecayIntervalMax > 0 ? World.Hook.OutOfBoundsDecayIntervalMax :
                                        (World.Hook.OutOfBoundsDecayInterval > 0 ? World.Hook.OutOfBoundsDecayInterval : 2000f);

                    uint nextInterval = (uint)Math.Clamp(maxInterval - (maxInterval - minInterval) * u, minInterval, maxInterval);
                    NextDecayTime = World.Time + nextInterval;
                }
            }
            else
            {
                DangerSince = 0;
                NextDecayTime = 0;
                DangerDecayCounter = 0;
            }

            if (isShooting)
            {
                ShootCooldownTime = World.Time + CalculateShotCooldown(Ships.Count);
                ShootCooldownTimeStart = World.Time;

                FiringWeapon = true;
            }

            if (World.Time >= BoostCooldownTime || BoostCooldownTime == BoostCooldownTimeStart)
                BoostCooldownStatus = 1;
            else
                BoostCooldownStatus = (float)
                    (World.Time - BoostCooldownTimeStart) / (BoostCooldownTime - BoostCooldownTimeStart);

            if (World.Time >= ShootCooldownTime || ShootCooldownTime == ShootCooldownTimeStart)
                ShootCooldownStatus = 1;
            else
                ShootCooldownStatus = (float)
                    (World.Time - ShootCooldownTimeStart) / (ShootCooldownTime - ShootCooldownTimeStart);

            bool anyAlive = false;
            for (int i = 0; i < Ships.Count; i++)
            {
                if (!Ships[i].PendingDestruction)
                {
                    anyAlive = true;
                    break;
                }
            }

            if (!anyAlive && NewShips.Count == 0)
                Die(null);
        }

    }
}