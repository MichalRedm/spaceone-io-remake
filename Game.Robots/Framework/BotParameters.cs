namespace Game.Robots.Framework
{
    using System;

    public class BotParameters
    {
        public bool IsCustom { get; set; } = false;

        // High-level parameters
        private float _skillLevel = 0.5f;
        public float SkillLevel
        {
            get => _skillLevel;
            set
            {
                _skillLevel = Math.Clamp(value, 0f, 1f);
                if (!IsCustom) ApplySkillLevel(_skillLevel, Playstyle);
            }
        }

        private string _playstyle = "Balanced";
        public string Playstyle
        {
            get => _playstyle;
            set
            {
                _playstyle = value ?? "Balanced";
                if (!IsCustom) ApplySkillLevel(SkillLevel, _playstyle);
            }
        }

        public float ScreenAspectRatio { get; set; } = 16f / 9f; // Default 16:9 widescreen
        public float ViewportWidth { get; set; } = 1500f; // World units matching client camera
        public float ViewportHeight => ViewportWidth / Math.Max(0.5f, ScreenAspectRatio);

        // Fleet size goals
        // Pro players often prefer smaller, nimble fleets (10-25 ships) for speed and bullet thrust,
        // while beginners aim to amass massive swarms (40-60+ ships).
        public int TargetFleetSize { get; set; } = 25;

        // Engage parameters
        public float EngageAdvantageRatio { get; set; } = 1.6f; // Engage if ratio >= this
        public float SafeDistance { get; set; } = 550f; // Close combat engagement distance
        public float PursuitDistance { get; set; } = 400f; // Distance to close in for lethal volleys

        // Biomechanical parameters
        public int ReactionLatencyMs { get; set; } = 150; // Human reaction time latency
        public float OvershootFactor { get; set; } = 1.2f; // Simulate Fitts's law overshoot
        public float CurveAmount { get; set; } = 0.3f; // Bezier curve amplitude
        public float VirtualCursorSpeed { get; set; } = 10f; // Speed of the virtual cursor (pixels per ms)
        public int SaccadeDurationMs { get; set; } = 50; // Visual pause duration when shifting targets rapidly
        public float FlickAimSpeed { get; set; } = 0.94f; // Wrist flick speed for aiming/shooting
        public float CruisingSpeed { get; set; } = 0.225f; // Smooth glide speed for navigation/cruising

        // Strategy utility multipliers
        public float CruisingUtilityBase { get; set; } = 0.1f;
        public float EngageUtilityMultiplier { get; set; } = 1.6f;
        public float EscapeUtilityMultiplier { get; set; } = 1.0f;
        
        // Escape parameters
        public float RetreatThreshold { get; set; } = 0.45f; // Flee if fleet ratio < this
        public float ThreatDistanceThreshold { get; set; } = 550f;
        public int MinimumBulletsToEscape { get; set; } = 15;
        public float DangerZoneBuffer { get; set; } = 400f; // Distance from world edge considered danger zone

        // Combat & Aiming parameters
        public float PredictiveAimFactor { get; set; } = 1.0f; // 1.0 = full lead calculation, 0.0 = direct/no lead
        public float AimInFlightDirectionWeight { get; set; } = 0.0f; // 1.0 = shoot where flying (complete noob), 0.0 = decoupled aim
        public float MaxOffAxisShotAngle { get; set; } = MathF.PI; // Max angular deviation from flight direction to take a shot
        public float PreAimCooldownThreshold { get; set; } = 0.85f; // CooldownShoot (0->1) threshold to begin pre-aiming
        public float KitingSkill { get; set; } = 0.65f; // Continuous tactical spacing/kiting skill [0..1]
        public float AimJitter { get; set; } = 0.03f; // Angular jitter in radians (imperfect human aim)
        public float FiringAngleTolerance { get; set; } = 0.25f; // Maximum angular error to pull the trigger
        public float BulletDodgeSkill { get; set; } = 1.0f; // 1.0 = matrix dodger, 0.0 = noob walks into bullets

        // Evasion & Dodging mechanics (Probabilistic Human Perception Model)
        public float BulletDodgeProbability { get; set; } = 0.60f; // Chance to notice an incoming bullet cluster
        public float BulletDodgeAngularError { get; set; } = 0.10f; // Angular imperfection in dodge direction (radians)

        // Movement & Steering non-determinism (Symmetry Breaking)
        public float SteeringNoiseAmplitude { get; set; } = 0.15f; // Amplitude of low-frequency wander noise to break lockstep orbits
        public float CursorTremorRadius { get; set; } = 8f; // Hand tremor radius (pixels) for virtual cursor

        // Strategy selection non-determinism (Distraction / Hesitation)
        public float PerceptualNoise { get; set; } = 0.10f; // Noise added to strategy utility evaluations

        // Dash & Escape behavior parameters
        public bool OffensiveDashEnabled { get; set; } = true;
        public bool DefensiveDashEnabled { get; set; } = true;
        public float DefensiveDashSkill { get; set; } = 0.65f;
        public float OffensiveDashSkill { get; set; } = 0.65f;
        public float SurroundEscapeSkill { get; set; } = 0.65f;
        public float TravelBoostTendency { get; set; } = 0.55f;
        public float BoostHesitancy { get; set; } = 0.0f; // Chance (0-1) to hesitate / delay boosting
        public int MinimumShipsToOffensiveDash { get; set; } = 15;
        public int MinimumShipsToDefensiveDash { get; set; } = 8;

        // Sensory & Off-screen perception parameters
        public long OffscreenMemoryDurationMs { get; set; } = 4000; // How long to remember enemies after leaving screen
        public bool TracksOffscreenBullets { get; set; } = true; // Whether incoming bullets reveal off-screen shooters
        public float OffscreenBulletTrackChance { get; set; } = 0.85f; // Smooth probability to backtrack incoming off-screen bullets

        // Leader hunt / King hunt parameters
        public float LeaderHuntTendency { get; set; } = 0.68f; // Tendency to roam towards leader arrow in FFA

        private static float SmoothStep(float edge0, float edge1, float x)
        {
            float t = Math.Clamp((x - edge0) / Math.Max(1e-5f, edge1 - edge0), 0f, 1f);
            return t * t * (3f - 2f * t);
        }

        private static float Lerp(float a, float b, float t) => a + (b - a) * Math.Clamp(t, 0f, 1f);

        /// <summary>
        /// Maps a high-level skill level [0.0 - 1.0] and playstyle to low-level behavioral parameters,
        /// using C1-smooth progression curves and seeded individuality with no hard tier jumps.
        /// </summary>
        public void ApplySkillLevel(float skill, string playstyle = "Balanced", int? seed = null)
        {
            if (IsCustom) return;

            _skillLevel = Math.Clamp(skill, 0f, 1f);
            _playstyle = playstyle ?? "Balanced";

            var rand = seed.HasValue ? new Random(seed.Value) : Random.Shared;
            float Jitter(float baseVal, float variancePct)
            {
                float delta = (float)(rand.NextDouble() * 2.0 - 1.0) * variancePct;
                return baseVal * (1.0f + delta);
            }

            float s = _skillLevel;

            // 1. Aiming & Mouse Mechanics (Smooth Curves):
            FlickAimSpeed = Math.Clamp((0.18f + 0.78f * MathF.Pow(s, 1.15f)) * Jitter(1.0f, 0.05f), 0.12f, 0.98f);
            CruisingSpeed = Math.Clamp((0.08f + 0.22f * s) * Jitter(1.0f, 0.06f), 0.06f, 0.35f);

            AimJitter = Math.Clamp((0.36f * MathF.Pow(1.0f - s, 1.35f) + 0.005f) * Jitter(1.0f, 0.10f), 0.004f, 0.45f);
            CursorTremorRadius = Math.Clamp((35f * MathF.Pow(1.0f - s, 1.3f) + 0.5f) * Jitter(1.0f, 0.12f), 0.4f, 45f);

            PredictiveAimFactor = Math.Clamp(MathF.Pow(s, 1.05f) * Jitter(1.0f, 0.05f), 0f, 1f);

            // Flight direction coupling & maximum off-axis flick angle (smoothly unlocks full 180° kiting/reclaim)
            AimInFlightDirectionWeight = Math.Clamp((1.0f - MathF.Pow(s, 0.5f)) * 0.92f * Jitter(1.0f, 0.10f), 0f, 0.95f);
            MaxOffAxisShotAngle = Math.Clamp(Lerp(0.60f, MathF.PI, SmoothStep(0.05f, 0.62f, s)), 0.50f, MathF.PI);
            PreAimCooldownThreshold = Math.Clamp(Lerp(0.97f, 0.92f, SmoothStep(0.05f, 0.85f, s)), 0.90f, 0.98f);

            KitingSkill = SmoothStep(0.05f, 0.85f, s);
            FiringAngleTolerance = Math.Clamp(0.62f - 0.56f * MathF.Pow(s, 0.80f), 0.055f, 0.68f);
            ReactionLatencyMs = (int)Math.Clamp(Jitter(540f - 415f * s, 0.08f), 115f, 600f);
            DangerZoneBuffer = Math.Clamp(80f + 320f * s, 60f, 450f);

            // 2. Probabilistic Bullet Dodging:
            BulletDodgeProbability = Math.Clamp((0.22f + 0.76f * MathF.Pow(s, 0.70f)) * Jitter(1.0f, 0.05f), 0.15f, 0.99f);
            BulletDodgeAngularError = Math.Clamp((0.65f * MathF.Pow(1.0f - s, 1.35f) + 0.015f) * Jitter(1.0f, 0.08f), 0.01f, 0.75f);
            BulletDodgeSkill = Math.Clamp(0.15f + 0.85f * MathF.Pow(s, 0.85f), 0.10f, 1.0f);

            // 3. Movement, Symmetry Breaking & Strategy Noise:
            SteeringNoiseAmplitude = Math.Clamp((0.45f * (1.0f - s) + 0.05f) * Jitter(1.0f, 0.10f), 0.03f, 0.55f);
            PerceptualNoise = Math.Clamp(0.35f * (1.0f - MathF.Pow(s, 0.8f)), 0.02f, 0.40f);

            // 4. Smooth Dash, Surround Breakout & Travel-Boost Curves:
            DefensiveDashSkill = SmoothStep(0.18f, 0.85f, s);
            OffensiveDashSkill = SmoothStep(0.32f, 0.88f, s);
            SurroundEscapeSkill = SmoothStep(0.25f, 0.85f, s);
            TravelBoostTendency = Math.Clamp(SmoothStep(0.38f, 0.92f, s) * Jitter(1.0f, 0.08f), 0f, 1f);

            BoostHesitancy = Math.Clamp(Jitter(0.85f * MathF.Pow(1.0f - s, 1.35f) + 0.03f, 0.12f), 0.02f, 0.92f);
            MinimumShipsToOffensiveDash = (int)Math.Clamp(MathF.Round(Jitter(Lerp(22f, 10f, SmoothStep(0.25f, 0.90f, s)), 0.12f)), 8f, 26f);
            MinimumShipsToDefensiveDash = (int)Math.Clamp(MathF.Round(Jitter(Lerp(10f, 4f, SmoothStep(0.15f, 0.85f, s)), 0.12f)), 3f, 12f);

            DefensiveDashEnabled = DefensiveDashSkill > 0.02f;
            OffensiveDashEnabled = OffensiveDashSkill > 0.02f;

            // 5. Smooth Perception & Off-screen Tracking:
            OffscreenMemoryDurationMs = (long)Math.Clamp(Jitter(250f + 5250f * MathF.Pow(s, 1.15f), 0.12f), 150f, 6500f);
            OffscreenBulletTrackChance = SmoothStep(0.15f, 0.78f, s);
            TracksOffscreenBullets = OffscreenBulletTrackChance > 0.02f;

            // 6. Smooth Fleet Size Preference:
            TargetFleetSize = (int)Math.Clamp(MathF.Round(Jitter(Lerp(56f, 18f, SmoothStep(0.0f, 0.90f, s)), 0.15f)), 12f, 75f);

            // 7. Smooth Skill-Based Retreat Threshold (low levels flee earlier; high levels kite until ~1 ship or overwhelmed):
            float baseRetreatThreshold = Lerp(0.32f, 0.09f, SmoothStep(0.05f, 0.85f, s));

            // 8. Playstyle Modifications:
            bool isKingHunter = false;
            switch (_playstyle.ToLowerInvariant())
            {
                case "aggressive":
                case "hunter":
                    EngageAdvantageRatio = Jitter(1.1f, 0.1f);
                    RetreatThreshold = Math.Clamp(baseRetreatThreshold * 0.72f, 0.06f, 0.30f);
                    SafeDistance = Jitter(420f, 0.1f);
                    PursuitDistance = Jitter(330f, 0.1f);
                    LeaderHuntTendency = Math.Clamp(Jitter(0.84f, 0.08f), 0.72f, 0.96f);
                    TargetFleetSize = Math.Max(10, TargetFleetSize - 6);
                    FlickAimSpeed = Math.Clamp(FlickAimSpeed * 1.10f, 0.15f, 0.98f);
                    OffensiveDashSkill = Math.Clamp(OffensiveDashSkill + 0.08f, 0f, 1f);
                    break;

                case "cautious":
                case "farmer":
                    EngageAdvantageRatio = Jitter(2.2f, 0.1f);
                    RetreatThreshold = Math.Clamp(baseRetreatThreshold * 1.18f, 0.11f, 0.45f);
                    DefensiveDashSkill = Math.Clamp(DefensiveDashSkill + 0.10f, 0f, 1f);
                    DefensiveDashEnabled = DefensiveDashSkill > 0.02f;
                    SafeDistance = Jitter(680f, 0.1f);
                    PursuitDistance = Jitter(500f, 0.1f);
                    LeaderHuntTendency = Math.Clamp(Jitter(0.58f, 0.12f), 0.42f, 0.74f);
                    TargetFleetSize += 12;
                    break;

                case "kinghunter":
                    isKingHunter = true;
                    EngageAdvantageRatio = Jitter(1.3f, 0.1f);
                    RetreatThreshold = Math.Clamp(baseRetreatThreshold * 0.82f, 0.07f, 0.34f);
                    LeaderHuntTendency = Math.Clamp(Jitter(0.92f, 0.06f), 0.82f, 0.99f);
                    SafeDistance = Jitter(500f, 0.1f);
                    PursuitDistance = Jitter(380f, 0.1f);
                    OffensiveDashSkill = Math.Clamp(OffensiveDashSkill + 0.08f, 0f, 1f);
                    break;

                case "swarm":
                    RetreatThreshold = Math.Clamp(baseRetreatThreshold * 0.88f, 0.07f, 0.36f);
                    TargetFleetSize = Math.Max(45, (int)Jitter(60, 0.15f));
                    LeaderHuntTendency = Math.Clamp(Jitter(0.68f, 0.10f), 0.54f, 0.82f);
                    SafeDistance = Jitter(620f, 0.1f);
                    PursuitDistance = Jitter(450f, 0.1f);
                    break;

                case "balanced":
                default:
                    EngageAdvantageRatio = Jitter(1.5f, 0.1f);
                    RetreatThreshold = Math.Clamp(baseRetreatThreshold, 0.08f, 0.40f);
                    SafeDistance = Jitter(550f, 0.1f);
                    PursuitDistance = Jitter(400f, 0.1f);
                    LeaderHuntTendency = Math.Clamp(Jitter(0.76f, 0.10f), 0.62f, 0.90f);
                    break;
            }

            // Rare individual lone-wolf exception (~5% of non-KingHunter bots mostly ignore the leader)
            if (!isKingHunter && rand.NextDouble() < 0.05)
            {
                LeaderHuntTendency = 0.08f + (float)rand.NextDouble() * 0.14f;
            }
        }
    }
}
