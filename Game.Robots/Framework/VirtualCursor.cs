namespace Game.Robots.Framework
{
    using System;
    using System.Collections.Generic;
    using System.Numerics;

    public class VirtualCursor
    {
        private HumanoidBot _bot;
        public Vector2 CurrentRelativePosition { get; private set; }
        private bool _isInitialized = false;
        
        private Vector2 _perceivedTarget;
        
        public VirtualCursor(HumanoidBot bot)
        {
            _bot = bot;
            CurrentRelativePosition = new Vector2(1000, 0); // Start aiming right
        }

        private float _currentSpeed = 0.15f;

        public void SetTarget(Vector2 absoluteTarget, float speed = 0.15f)
        {
            _currentSpeed = speed;

            // Human players aim at targets relative to their own ship on the screen.
            var relativeTarget = absoluteTarget - _bot.Position;
            
            // Limit the mouse to the physical screen bounds (matching player's aspect ratio/monitor)
            float halfWidth = _bot.Parameters.ViewportWidth / 2f;
            float halfHeight = _bot.Parameters.ViewportHeight / 2f;
            relativeTarget.X = Math.Clamp(relativeTarget.X, -halfWidth, halfWidth);
            relativeTarget.Y = Math.Clamp(relativeTarget.Y, -halfHeight, halfHeight);

            _perceivedTarget = relativeTarget;
            _isInitialized = true;
        }

        private long _lastGameTime = 0;
        private float _tremorPhase = 0f;

        public void Update(long gameTime)
        {
            if (!_isInitialized) return;
            if (_lastGameTime == 0) { _lastGameTime = gameTime; return; }
            
            float dt = (gameTime - _lastGameTime);
            if (dt <= 0) return; // Prevent multiple updates if GameTime hasn't progressed

            // Calculate organic hand tremor based on player skill and CursorTremorRadius
            _tremorPhase += dt * 0.006f;
            float tremorRadius = _bot.Parameters.CursorTremorRadius;
            Vector2 tremor = Vector2.Zero;
            if (tremorRadius > 0.5f)
            {
                tremor = new Vector2(
                    MathF.Sin(_tremorPhase * 2.3f) + MathF.Cos(_tremorPhase * 4.1f) * 0.4f,
                    MathF.Cos(_tremorPhase * 1.9f) + MathF.Sin(_tremorPhase * 3.7f) * 0.4f
                ) * (tremorRadius * 0.6f);
            }

            // Calculate a time-scaled Lerp factor based on the current movement speed (smooth vs flick)
            float factor = 1f - MathF.Pow(1f - _currentSpeed, dt / 25f);
            
            var targetWithTremor = _perceivedTarget + tremor;
            CurrentRelativePosition = Vector2.Lerp(CurrentRelativePosition, targetWithTremor, factor);
            _lastGameTime = gameTime;
        }
        
        public bool IsAimedAt(Vector2 absoluteTarget, float angleTolerance = 0.30f)
        {
            var relativeTarget = absoluteTarget - _bot.Position;
            if (relativeTarget.LengthSquared() < 0.001f) return true;

            float targetAngle = MathF.Atan2(relativeTarget.Y, relativeTarget.X);
            float currentAngle = MathF.Atan2(CurrentRelativePosition.Y, CurrentRelativePosition.X);

            float diff = targetAngle - currentAngle;
            while (diff > MathF.PI) diff -= MathF.PI * 2;
            while (diff < -MathF.PI) diff += MathF.PI * 2;

            return MathF.Abs(diff) <= angleTolerance;
        }

        public Vector2 GetRelativePosition()
        {
            return CurrentRelativePosition;
        }
    }
}
