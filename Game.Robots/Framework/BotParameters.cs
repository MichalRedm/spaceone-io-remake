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
        public float ThreatDistanceThreshold { get; set; } = 550f;
        public int MinimumBulletsToEscape { get; set; } = 15;
        public float DangerZoneBuffer { get; set; } = 400f; // Distance from world edge considered danger zone

        // Combat & Aiming parameters
        public float PredictiveAimFactor { get; set; } = 1.0f; // 1.0 = full lead calculation, 0.0 = direct/no lead
        public float AimInFlightDirectionWeight { get; set; } = 0.0f; // 1.0 = shoot where flying (complete noob), 0.0 = decoupled aim
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

        // Dash behavior parameters
        public bool OffensiveDashEnabled { get; set; } = true;
        public bool DefensiveDashEnabled { get; set; } = true;
        public float BoostHesitancy { get; set; } = 0.0f; // Chance (0-1) to hesitate / delay boosting
        public int MinimumShipsToOffensiveDash { get; set; } = 15;
        public int MinimumShipsToDefensiveDash { get; set; } = 8;

        // Sensory & Off-screen perception parameters
        public long OffscreenMemoryDurationMs { get; set; } = 4000; // How long to remember enemies after leaving screen
        public bool TracksOffscreenBullets { get; set; } = true; // Whether incoming bullets reveal off-screen shooters

        // Leader hunt / King hunt parameters
        public float LeaderHuntTendency { get; set; } = 0.50f; // Tendency to roam towards leader arrow in FFA

        /// <summary>
        /// Maps a high-level skill level [0.0 - 1.0] and playstyle to low-level behavioral parameters,
        /// introducing realistic human progression curves and pseudo-random individuality.
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

            // 1. Aiming & Mouse Mechanics:
            // Flick speed has the single highest correlation (+0.548) with success:
            FlickAimSpeed = Math.Clamp((0.18f + 0.78f * MathF.Pow(_skillLevel, 1.15f)) * Jitter(1.0f, 0.05f), 0.12f, 0.98f);
            CruisingSpeed = Math.Clamp((0.08f + 0.22f * _skillLevel) * Jitter(1.0f, 0.06f), 0.06f, 0.35f);

            // Aim jitter (-0.262 correlation): ~0.36 rad (~21 deg) down to 0.015 rad (< 1 deg)
            AimJitter = Math.Clamp((0.36f * (1.0f - _skillLevel) + 0.015f) * Jitter(1.0f, 0.12f), 0.01f, 0.45f);
            CursorTremorRadius = Math.Clamp((35f * (1.0f - _skillLevel) + 2f) * Jitter(1.0f, 0.15f), 1f, 45f);

            // Predictive Aim (+0.203 correlation):
            PredictiveAimFactor = Math.Clamp(MathF.Pow(_skillLevel, 1.35f) * Jitter(1.0f, 0.08f), 0f, 1f);

            // Flight direction coupling: complete beginners shoot where flying, rapidly decouples by skill 0.3-0.4
            AimInFlightDirectionWeight = Math.Clamp((1.0f - MathF.Pow(_skillLevel, 0.5f)) * 0.92f * Jitter(1.0f, 0.10f), 0f, 0.95f);

            // Firing angle tolerance (-0.128 correlation):
            FiringAngleTolerance = Math.Clamp(0.65f - 0.48f * MathF.Pow(_skillLevel, 0.75f), 0.14f, 0.70f);

            // Reaction time: 540ms (noob) down to 125ms (pro)
            ReactionLatencyMs = (int)Math.Clamp(Jitter(540f - 415f * _skillLevel, 0.08f), 115f, 600f);

            // Danger zone awareness:
            DangerZoneBuffer = Math.Clamp(80f + 320f * _skillLevel, 60f, 450f);

            // 2. Probabilistic Bullet Dodging:
            // In humans, dodging is not a weak force, but a probabilistic perception check!
            // Noobs dodge occasionally (~25-35%), intermediates dodge reliably (~65-75%), pros dodge almost every time (90-99%).
            BulletDodgeProbability = Math.Clamp((0.22f + 0.76f * MathF.Pow(_skillLevel, 0.70f)) * Jitter(1.0f, 0.05f), 0.15f, 0.99f);
            // Angular error: noobs panic-dodge with high angular error (~0.65 rad / ~37 deg); pros dodge cleanly at 90 deg (< 0.03 rad)
            BulletDodgeAngularError = Math.Clamp((0.65f * MathF.Pow(1.0f - _skillLevel, 1.35f) + 0.015f) * Jitter(1.0f, 0.08f), 0.01f, 0.75f);
            BulletDodgeSkill = Math.Clamp(0.15f + 0.85f * MathF.Pow(_skillLevel, 0.85f), 0.10f, 1.0f);

            // 3. Movement & Symmetry Breaking:
            // Low-skill bots have erratic steering noise (breaks circling symmetry); pros have disciplined trajectories
            SteeringNoiseAmplitude = Math.Clamp((0.45f * (1.0f - _skillLevel) + 0.05f) * Jitter(1.0f, 0.10f), 0.03f, 0.55f);

            // 4. Decision & Strategy Non-Determinism:
            // Beginners get distracted or hesitate (high perceptual noise in utility); pros evaluate utilities deterministically
            PerceptualNoise = Math.Clamp(0.35f * (1.0f - MathF.Pow(_skillLevel, 0.8f)), 0.02f, 0.40f);

            // 5. Dash & Boost Mechanics (Judicious Boost Usage):
            // Empirical finding: High boost hesitancy (+0.288) correlates with success because spamming boost drains fleet mass!
            if (_skillLevel < 0.22f)
            {
                OffensiveDashEnabled = false;
                DefensiveDashEnabled = false; // True noobs don't even know how to boost defensively
                BoostHesitancy = 0.95f;
                MinimumShipsToOffensiveDash = 999;
                MinimumShipsToDefensiveDash = 999;
            }
            else if (_skillLevel < 0.45f)
            {
                OffensiveDashEnabled = false;
                DefensiveDashEnabled = rand.NextDouble() < 0.4;
                BoostHesitancy = Math.Clamp(Jitter(0.60f * (1.0f - _skillLevel), 0.15f), 0.2f, 0.8f);
                MinimumShipsToOffensiveDash = 999;
                MinimumShipsToDefensiveDash = (int)Jitter(16, 0.15f);
            }
            else if (_skillLevel < 0.70f)
            {
                OffensiveDashEnabled = rand.NextDouble() < 0.7;
                DefensiveDashEnabled = true;
                BoostHesitancy = Math.Clamp(Jitter(0.25f * (1.0f - _skillLevel), 0.15f), 0.05f, 0.35f);
                MinimumShipsToOffensiveDash = (int)Jitter(20 - (int)(_skillLevel * 10), 0.15f);
                MinimumShipsToDefensiveDash = (int)Jitter(10, 0.15f);
            }
            else
            {
                OffensiveDashEnabled = true;
                DefensiveDashEnabled = true;
                BoostHesitancy = 0.05f; // Even pros don't boost recklessly
                MinimumShipsToOffensiveDash = (int)Jitter(14, 0.15f);
                MinimumShipsToDefensiveDash = (int)Jitter(7, 0.15f);
            }

            // 6. Perception & Off-screen Tracking:
            if (_skillLevel < 0.25f)
            {
                OffscreenMemoryDurationMs = (long)Jitter(200 + (long)(_skillLevel * 800), 0.2f);
                TracksOffscreenBullets = false;
            }
            else if (_skillLevel < 0.65f)
            {
                OffscreenMemoryDurationMs = (long)Jitter(1200 + (long)(_skillLevel * 2500), 0.15f);
                TracksOffscreenBullets = rand.NextDouble() < 0.65;
            }
            else
            {
                OffscreenMemoryDurationMs = (long)Jitter(3500 + (long)(_skillLevel * 2500), 0.10f);
                TracksOffscreenBullets = true;
            }

            // 7. Fleet Size Preference:
            if (_skillLevel < 0.30f)
            {
                TargetFleetSize = (int)Math.Clamp(Jitter(50 + (int)((0.30f - _skillLevel) * 40), 0.15f), 35, 75);
            }
            else if (_skillLevel < 0.70f)
            {
                TargetFleetSize = (int)Math.Clamp(Jitter(28 + (int)((0.70f - _skillLevel) * 20), 0.15f), 18, 45);
            }
            else
            {
                TargetFleetSize = (int)Math.Clamp(Jitter(18, 0.20f), 12, 30);
            }

            // 8. Playstyle Modifications (Empirical Archetypes):
            switch (_playstyle.ToLowerInvariant())
            {
                case "aggressive":
                case "hunter":
                    EngageAdvantageRatio = Jitter(1.1f, 0.1f);
                    SafeDistance = Jitter(420f, 0.1f);
                    PursuitDistance = Jitter(330f, 0.1f);
                    LeaderHuntTendency = Math.Clamp(Jitter(0.75f, 0.15f), 0.5f, 0.95f);
                    TargetFleetSize = Math.Max(10, TargetFleetSize - 6);
                    FlickAimSpeed = Math.Clamp(FlickAimSpeed * 1.10f, 0.15f, 0.98f);
                    break;

                case "cautious":
                case "farmer":
                    EngageAdvantageRatio = Jitter(2.2f, 0.1f); // Only fight with heavy advantage
                    SafeDistance = Jitter(680f, 0.1f);
                    PursuitDistance = Jitter(500f, 0.1f);
                    LeaderHuntTendency = Math.Clamp(Jitter(0.20f, 0.15f), 0.05f, 0.35f);
                    TargetFleetSize = TargetFleetSize + 12;
                    break;

                case "kinghunter":
                    EngageAdvantageRatio = Jitter(1.3f, 0.1f);
                    LeaderHuntTendency = Math.Clamp(Jitter(0.92f, 0.06f), 0.80f, 1.0f);
                    SafeDistance = Jitter(500f, 0.1f);
                    break;

                case "swarm":
                    TargetFleetSize = Math.Max(45, (int)Jitter(60, 0.15f));
                    LeaderHuntTendency = 0.35f;
                    SafeDistance = Jitter(620f, 0.1f);
                    break;

                case "balanced":
                default:
                    EngageAdvantageRatio = Jitter(1.5f, 0.1f);
                    SafeDistance = Jitter(550f, 0.1f);
                    PursuitDistance = Jitter(400f, 0.1f);
                    LeaderHuntTendency = Math.Clamp(Jitter(0.50f, 0.15f), 0.25f, 0.75f);
                    break;
            }
        }
    }
}
