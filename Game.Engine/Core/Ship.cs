namespace Game.Engine.Core
{
    using Game.API.Common;
    using Game.Engine.Core.Pickups;
    using Game.Engine.Core.Weapons;
    using System;
    using System.Numerics;

    public class Ship : ActorBody, ICollide
    {
        public virtual int HealthHitCost { get => World.Hook.HealthHitCost; }
        public virtual int MaxHealth { get => World.Hook.MaxHealth; }
        public virtual float HealthRegenerationPerFrame { get => World.Hook.HealthRegenerationPerFrame; }

        public Fleet Fleet { get; set; }

        public float Health { get; set; }
        public int SizeMinimum { get; set; }
        public int SizeMaximum { get; set; }

        public float ThrustAmount { get; set; }
        public float BoostThrustAmount { get; set; } = 0;
        public float Drag { get; set; }

        public float AngleMovement { get; set; }

        public bool Abandoned { get; set; }
        public Fleet AbandonedByFleet { get; set; }
        public long AbandonedTime { get; set; }

        protected bool IsOOB = false;
        private long TimeDeath = 0;

        public Ship()
        {
            Size = 10;
        }

        public int ShieldStrength { get; set; }

        public Sprites BulletSprite
        {
            get
            {
                switch (Sprite)
                {
                    case Sprites.ship_cyan: return Sprites.bullet_cyan;
                    case Sprites.ship_blue: return Sprites.bullet_blue;
                    case Sprites.ship_green: return Sprites.bullet_green;
                    case Sprites.ship_orange: return Sprites.bullet_orange;
                    case Sprites.ship_pink: return Sprites.bullet_pink;
                    case Sprites.ship_red: return Sprites.bullet_red;
                    case Sprites.ship_yellow: return Sprites.bullet_yellow;
                    case Sprites.ship_secret: return Sprites.bullet_yellow;
                    case Sprites.ship_zed: return Sprites.bullet_red;
                    default: return Sprites.bullet;
                }
            }
        }

        public override void Init(World world)
        {
            base.Init(world);

            Health = MaxHealth;
            Drag = World.Hook.Drag;

            this.Group = this.Fleet;
        }

        public override void Destroy()
        {
            if (!(this is Fish)
                && !(this.Sprite == Sprites.ship_gray)
            )
                Boom.FromShip(this);

            base.Destroy();

            if (Fleet?.Ships?.Contains(this) ?? false)
                Fleet.Ships.Remove(this);
        }

        public void Die(Player player, Fleet fleet, ShipWeaponBullet bullet)
        {
            if (player != null)
                World.Scoring.ShipDied(player, this.Fleet?.Owner, this);

            fleet?.KilledShip(this);

            PendingDestruction = true;

            if (this.Fleet != null)
                this.Fleet.ShipDeath(player, this, bullet);
        }

        public virtual void CollisionExecute(Body projectedBody)
        {
            if (projectedBody is ShipWeaponBullet bullet)
            {
                var fleet = bullet?.OwnedByFleet;
                var player = fleet?.Owner;
                bullet.Consumed = true;

                var takesDamage = true;
                if (this.Fleet?.Owner?.IsShielded ?? false)
                {
                    if (this.ShieldStrength == 0)
                        takesDamage = true;
                    else
                    {
                        this.ShieldStrength--;
                        takesDamage = false;
                    }
                }
                else
                    takesDamage = !this.Fleet?.Owner?.IsInvulnerable ?? true;

                if (takesDamage)
                {
                    Health -= HealthHitCost;

                    if (Health <= 0)
                        Die(player, fleet, bullet);
                }
            }
        }

        public bool IsCollision(Body projectedBody)
        {
            if (PendingDestruction)
                return false;

            if (projectedBody is ShipWeaponBullet bullet)
            {
                // avoid "piercing" shots
                if (bullet.Consumed)
                    return false;

                // if it came from this fleet
                if (bullet.OwnedByFleet == this?.Fleet)
                    return false;

                // if it came from this fleet
                if (bullet.OwnedByFleet == this?.AbandonedByFleet
                    && World.Time < (this.AbandonedTime + World.Hook.AbandonBuffer))
                    return false;

                // team mode ensures that bullets of like colors do no harm
                if (World.Hook.TeamMode && bullet.Color == this.Color)
                    return false;

                // did it actually hit
                if ((Vector2.Distance(projectedBody.Position, this.Position)
                        <= this.Size + projectedBody.Size))
                    return true;
            }

            if (!this.Abandoned)
            {
                if (projectedBody is PickupBase
                    || projectedBody is SystemActors.CTF.Base
                    || projectedBody is SystemActors.CTF.Flag)
                    return ((Vector2.Distance(projectedBody.Position, this.Position)
                            <= this.Size + projectedBody.Size));
            }

            return false;
        }

        public override void Think()
        {
            base.Think();

            if (Abandoned && (AbandonedByFleet?.PendingDestruction ?? false)) {
                Die(null, null, null);
            }

            if (Abandoned && World.Hook.AbandonedShipLifespan > 0 && World.Time >= AbandonedTime + World.Hook.AbandonedShipLifespan) {
                Die(null, null, null);
            }

            Health = Math.Max(Math.Min(Health, MaxHealth), 0) + HealthRegenerationPerFrame;
            //Size = (int)(SizeMinimum + (Health / MaxHealth) * (SizeMaximum - SizeMinimum));

            DoOutOfBoundsRules();

            float AngleQuantized = World.Hook.Quantization
                ? (float)(Math.Round(AngleMovement / (2 * Math.PI) * World.Hook.QuantizationCount) / World.Hook.QuantizationCount * 2 * Math.PI)
                : AngleMovement;

            if (!Abandoned)
            {
                if (World.Hook.KinematicMovement)
                {
                    bool isBoosting = Fleet != null && World.Time < Fleet.BoostUntil;
                    float baseCruiseSpeed = ThrustAmount * World.Hook.MaxMomentumCoefficient;

                    // Current velocity direction
                    float currentSpeed = Momentum.Length();
                    float targetAngle = AngleMovement;
                    float currentAngle = currentSpeed > 0.0001f
                        ? MathF.Atan2(Momentum.Y, Momentum.X)
                        : targetAngle;

                    // Wrapped angular steering difference in [-PI, +PI]
                    float angleDiff = (targetAngle - currentAngle + MathF.PI) % (MathF.PI * 2f);
                    if (angleDiff < 0f) angleDiff += MathF.PI * 2f;
                    angleDiff -= MathF.PI;

                    // Enforce unified fleet turn direction on sharp / near-180° turns (|angleDiff| > ~150 deg = 2.6 rad)
                    // to prevent symmetry breaking where some ships turn left and others turn right, splitting the fleet
                    if (MathF.Abs(angleDiff) > 2.6f && Fleet != null)
                    {
                        angleDiff = Fleet.FleetTurnSign * MathF.Abs(angleDiff);
                    }

                    float maxTurnRate;
                    float effectiveSpeed;

                    if (isBoosting)
                    {
                        // 3-Phase Kinematic Boost Speed Profile
                        int fleetSize = Math.Max(1, Fleet?.Ships?.Count ?? 1);
                        float scale = World.Hook.BaseThrustConverter * World.Hook.MaxMomentumCoefficient * (1f - (Fleet?.Burden ?? 0f));
                        float vPeak = (World.Hook.BoostPeakBase - World.Hook.BoostPeakSlope * MathF.Log(fleetSize)) * scale;

                        // Elapsed time in ticks (0.0 to 24.0)
                        long elapsedMs = World.Time - (Fleet.BoostUntil - World.Hook.BoostDuration);
                        float tBoost = Math.Clamp(elapsedMs / 40f, 0f, 24f);

                        float vSustain = 0.77f * vPeak;
                        if (tBoost <= 4f)
                        {
                            // Phase 1: Initial Surge Ramp (0 - 160ms)
                            effectiveSpeed = baseCruiseSpeed + (vPeak - baseCruiseSpeed) * (tBoost / 4f);
                            maxTurnRate = World.Hook.BoostTurnRate;
                        }
                        else if (tBoost <= 9f)
                        {
                            // Phase 2: Sustained Jet Burn Plateau (200 - 360ms)
                            effectiveSpeed = vSustain;
                            maxTurnRate = World.Hook.BoostTurnRate;
                        }
                        else
                        {
                            // Phase 3: Linear Exhaust Deceleration smoothly back to baseCruiseSpeed (400 - 1000ms)
                            float decelProgress = (tBoost - 9f) / 15f;
                            effectiveSpeed = vSustain - (vSustain - baseCruiseSpeed) * decelProgress;
                            maxTurnRate = World.Hook.BoostTurnRate + (World.Hook.TurnRate - World.Hook.BoostTurnRate) * decelProgress;
                        }
                    }
                    else
                    {
                        // Dynamic turn speed dip during regular cruising
                        float turnFraction = MathF.Abs(angleDiff) / MathF.PI;
                        effectiveSpeed = baseCruiseSpeed * (1.0f - World.Hook.SpeedDip * turnFraction);
                        maxTurnRate = World.Hook.TurnRate;
                    }

                    // Clamp turn rate
                    float clampedDelta = Math.Clamp(angleDiff, -maxTurnRate, maxTurnRate);
                    float newAngle = currentAngle + clampedDelta;

                    Momentum = new Vector2(
                        effectiveSpeed * MathF.Cos(newAngle),
                        effectiveSpeed * MathF.Sin(newAngle)
                    );
                }
                else
                {
                    Vector2 thrust = new Vector2(MathF.Cos(AngleMovement), MathF.Sin(AngleMovement)) * ThrustAmount;
                    Vector2 thrustBoost = new Vector2(MathF.Cos(this.Fleet?.BoostAngle ?? 0f), MathF.Sin(this.Fleet?.BoostAngle ?? 0f)) * BoostThrustAmount;
                    Momentum = (Momentum + thrust + thrustBoost) * Drag;
                }
            }
            else
            {
                Momentum = Momentum * World.Hook.DragAbandoned;
            }
                

        }

        private void DoOutOfBoundsRules()
        {
            if (this.Fleet != null) {
                var oob = World.DistanceOutOfBounds(this.Fleet.FleetCenter);

                IsOOB = oob > 0;
                
                if (IsOOB && this.Fleet.DangerSince == 0) {
                    this.Fleet.DangerSince = World.Time;
                } else if (!IsOOB) {
                    this.Fleet.DangerSince = 0;
                }
                
                if (this.Fleet.DangerSince != 0 &&
                    World.Time > this.Fleet.DangerSince + World.Hook.OutOufBoundsDecayStart &&
                    Math.Floor((decimal)(World.Time - this.Fleet.DangerSince - World.Hook.OutOufBoundsDecayStart) / World.Hook.OutOufBoundsDecayInterval) != this.Fleet.DangerDecayCounter)
                {
                    this.Fleet?.Ships[this.Fleet.Ships.Count - 1]?.Die(null, null, null);
                    this.Fleet.DangerDecayCounter++;
                }
                
                //Console.WriteLine(this.Fleet.DangerSince + ", " + (World.Time + 5000));
                
                /*if (oob > World.Hook.OutOfBoundsBorder)
                    this.Momentum *= 1 - (oob / World.Hook.OutOfBoundsDecayDistance);

                if (oob > World.Hook.OutOfBoundsDeathLine)
                {
                    //Console.WriteLine("ship dying oob");
                    Die(null, null, null);
                }*/
            } else if (this.Sprite == Sprites.fish_blue ||
                       this.Sprite == Sprites.fish_cyan ||
                       this.Sprite == Sprites.fish_green ||
                       this.Sprite == Sprites.fish_orange ||
                       this.Sprite == Sprites.fish_pink ||
                       this.Sprite == Sprites.fish_red ||
                       this.Sprite == Sprites.fish_yellow) {
                var oob = World.DistanceOutOfBounds(Position);

                IsOOB = oob > 0;

                /*if (oob > World.Hook.OutOfBoundsBorder)
                    this.Momentum *= 1 - (oob / World.Hook.OutOfBoundsDecayDistance);*/

                if (oob > World.Hook.OutOfBoundsDeathLine)
                {
                    //Console.WriteLine("ship dying oob");
                    Die(null, null, null);
                }
            }
            // catch (Exception e) {}
        }
    }
}
