namespace Game.Robots.Framework
{
    public class BotParameters
    {
        // Fleet size goals
        public int TargetFleetSize { get; set; } = 25;

        // Engage parameters
        public float EngageAdvantageRatio { get; set; } = 1.6f; // Aggressive: engage even if enemy is noticeably larger
        public float SafeDistance { get; set; } = 550f; // Close combat engagement distance
        public float PursuitDistance { get; set; } = 400f; // Distance to close in for lethal volleys

        // Biomechanical parameters
        public int ReactionLatencyMs { get; set; } = 150; // Human reaction time latency
        public float OvershootFactor { get; set; } = 1.2f; // Simulate Fitts's law overshoot
        public float CurveAmount { get; set; } = 0.3f; // Bezier curve amplitude
        public float VirtualCursorSpeed { get; set; } = 10f; // Speed of the virtual cursor (pixels per ms)
        public int SaccadeDurationMs { get; set; } = 50; // Visual pause duration when shifting targets rapidly
        public float FlickAimSpeed { get; set; } = 0.94f; // Extremely rapid wrist flick speed for aiming/shooting (near instant)
        public float CruisingSpeed { get; set; } = 0.225f; // Smooth glide speed for navigation/cruising (+25%)

        // Strategy utility multipliers
        public float CruisingUtilityBase { get; set; } = 0.1f; // Decreased importance of cruising/wandering
        public float EngageUtilityMultiplier { get; set; } = 1.6f; // High priority to fight opponents
        public float EscapeUtilityMultiplier { get; set; } = 1.0f;
        
        // Escape parameters
        public float ThreatDistanceThreshold { get; set; } = 550f;
        public int MinimumBulletsToEscape { get; set; } = 15;
        public float DangerZoneBuffer { get; set; } = 400f; // Distance from world edge considered danger zone

        // Combat parameters
        public float PredictiveAimFactor { get; set; } = 1.0f; // 1.0 means perfect prediction, lower means lags behind

        // Dash behavior parameters
        public int MinimumShipsToOffensiveDash { get; set; } = 15;
        public int MinimumShipsToDefensiveDash { get; set; } = 8;
    }
}
