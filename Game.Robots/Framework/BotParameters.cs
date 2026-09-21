namespace Game.Robots.Framework
{
    using System;

    public class BotParameters
    {
        // High-level parameters
        private float _skillLevel = 0.5f;
        public float SkillLevel
        {
            get => _skillLevel;
            set
            {
                _skillLevel = Math.Clamp(value, 0f, 1f);
                ApplySkillLevel(_skillLevel, Playstyle);
            }
        }

        private string _playstyle = "Balanced";
        public string Playstyle
        {
            get => _playstyle;
            set
            {
                _playstyle = value ?? "Balanced";
                ApplySkillLevel(SkillLevel, _playstyle);
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
            _skillLevel = Math.Clamp(skill, 0f, 1f);
            _playstyle = playstyle ?? "Balanced";

            var rand = seed.HasValue ? new Random(seed.Value) : Random.Shared;
            float Jitter(float baseVal, float variancePct)
            {
                float delta = (float)(rand.NextDouble() * 2.0 - 1.0) * variancePct;
                return baseVal * (1.0f + delta);
            }

            // 1. Aiming & Mouse Mechanics:
            // Beginners: slow mouse, high jitter, aim where flying, 0 prediction, loose firing discipline
            // Pros: snappy wrist flicks, tight tracking, kinematic lead prediction, zero flight-direction bias
            PredictiveAimFactor = Math.Clamp(MathF.Pow(_skillLevel, 1.4f) * Jitter(1.0f, 0.08f), 0f, 1f);
            AimInFlightDirectionWeight = Math.Clamp((1.0f - MathF.Pow(_skillLevel, 0.6f)) * 0.95f * Jitter(1.0f, 0.10f), 0f, 0.98f);
            
            // Aim jitter in radians: ~0.42 rad (~24 deg) for noobs down to ~0.02 rad (~1.1 deg) for pros
            AimJitter = Math.Clamp((0.42f * (1.0f - _skillLevel) + 0.02f) * Jitter(1.0f, 0.15f), 0.01f, 0.50f);

            // Firing angle tolerance: Noobs spam fire even when off by 40 degrees; pros wait for alignment (~10-15 degrees)
            FiringAngleTolerance = Math.Clamp(0.70f - 0.52f * MathF.Pow(_skillLevel, 0.7f), 0.15f, 0.75f);

            // Bullet evasion skill: Noobs do NOT dodge bullets (skill^1.6 => 0 for noobs, 1 for pros)
            BulletDodgeSkill = Math.Clamp(MathF.Pow(_skillLevel, 1.6f) * Jitter(1.0f, 0.10f), 0f, 1f);

            // Flick and cruising speeds: Noobs have very slow cursor tracking
            FlickAimSpeed = Math.Clamp((0.10f + 0.85f * MathF.Pow(_skillLevel, 1.1f)) * Jitter(1.0f, 0.06f), 0.08f, 0.98f);
            CruisingSpeed = Math.Clamp((0.05f + 0.20f * _skillLevel) * Jitter(1.0f, 0.08f), 0.04f, 0.35f);

            // Reaction time: 520ms (noob) down to 130ms (pro)
            ReactionLatencyMs = (int)Math.Clamp(Jitter(520f - 390f * _skillLevel, 0.10f), 110f, 600f);

            // Danger zone awareness: Noobs hug the border and only react when right at edge (80 units)
            DangerZoneBuffer = Math.Clamp(80f + 320f * _skillLevel, 60f, 450f);

            // 2. Dash & Boost Mechanics:
            // Beginners rarely or never boost; hesitant to waste ships.
            // Pros dash decisively for executions and evasions.
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
                BoostHesitancy = 0.0f;
                MinimumShipsToOffensiveDash = (int)Jitter(12, 0.15f);
                MinimumShipsToDefensiveDash = (int)Jitter(6, 0.15f);
            }

            // 3. Perception & Off-screen Tracking:
            // Beginners have almost no off-screen tracking (forget enemies in 400ms, ignore bullet cues).
            // Pros maintain belief states for 4-6 seconds and deduce enemy positions from incoming fire.
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

            // 4. Fleet Size Preference:
            // Beginners love amassing huge swarms (40-65 ships).
            // Pros often keep it smaller, faster, and tighter (12-25 ships).
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
                TargetFleetSize = (int)Math.Clamp(Jitter(16, 0.20f), 10, 28);
            }

            // 5. Playstyle Modifications:
            switch (_playstyle.ToLowerInvariant())
            {
                case "aggressive":
                    EngageAdvantageRatio = Jitter(1.1f, 0.1f);
                    SafeDistance = Jitter(450f, 0.1f);
                    PursuitDistance = Jitter(350f, 0.1f);
                    LeaderHuntTendency = Math.Clamp(Jitter(0.75f, 0.15f), 0.5f, 0.95f);
                    TargetFleetSize = Math.Max(8, TargetFleetSize - 5);
                    break;

                case "cautious":
                case "farmer":
                    EngageAdvantageRatio = Jitter(2.2f, 0.1f); // Only fight with heavy advantage
                    SafeDistance = Jitter(680f, 0.1f);
                    PursuitDistance = Jitter(500f, 0.1f);
                    LeaderHuntTendency = Math.Clamp(Jitter(0.20f, 0.15f), 0.05f, 0.35f);
                    TargetFleetSize = TargetFleetSize + 10;
                    break;

                case "kinghunter":
                    EngageAdvantageRatio = Jitter(1.3f, 0.1f);
                    LeaderHuntTendency = Math.Clamp(Jitter(0.90f, 0.08f), 0.75f, 1.0f);
                    break;

                case "swarm":
                    TargetFleetSize = Math.Max(45, (int)Jitter(60, 0.15f));
                    LeaderHuntTendency = 0.40f;
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
