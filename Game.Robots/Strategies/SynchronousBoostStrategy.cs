namespace Game.Robots.Strategies
{
    using Game.Robots.Framework;
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Numerics;

    public class SynchronousBoostStrategy : IStrategy
    {
        private Dictionary<uint, int> _previousEnemySizes = new Dictionary<uint, int>();
        private uint _targetToChase = 0;
        private long _chaseStartTime = 0;
        
        public float EvaluateUtility(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            if (myFleet == null || myFleet.Ships.Count == 0) return -1f;

            var enemies = bot.SensorFleets.Others;

            // Maintain chase state for a brief duration once triggered
            if (_targetToChase != 0 && bot.GameTime - _chaseStartTime < 600)
            {
                return bot.Parameters.EngageUtilityMultiplier * 2.5f;
            }
            
            _targetToChase = 0;
            float maxUtility = -1f;

            foreach (var enemy in enemies)
            {
                // Detect boost: size drops significantly (by roughly half) in a single tick
                if (_previousEnemySizes.TryGetValue(enemy.ID, out int prevSize))
                {
                    if (enemy.Ships.Count > 0 && enemy.Ships.Count <= prevSize * 0.6f && prevSize > 5)
                    {
                        // Are we in an advantageous combat scenario with them?
                        float distance = Vector2.Distance(myFleet.Center, enemy.Center);
                        if (distance < bot.Parameters.SafeDistance && myFleet.Ships.Count > prevSize)
                        {
                            // Trigger synchronous boost!
                            float utility = bot.Parameters.EngageUtilityMultiplier * 2.5f; // Spike utility
                            if (utility > maxUtility)
                            {
                                maxUtility = utility;
                                _targetToChase = enemy.ID;
                                _chaseStartTime = bot.GameTime;
                            }
                        }
                    }
                }

                _previousEnemySizes[enemy.ID] = enemy.Ships.Count;
            }
            
            // Clean up dead enemies from dict
            var currentEnemyIds = enemies.Select(e => e.ID).ToHashSet();
            var keysToRemove = _previousEnemySizes.Keys.Where(k => !currentEnemyIds.Contains(k)).ToList();
            foreach(var k in keysToRemove) _previousEnemySizes.Remove(k);

            return maxUtility;
        }

        public void Execute(HumanoidBot bot)
        {
            var myFleet = bot.SensorFleets.MyFleet;
            if (myFleet == null || _targetToChase == 0) return;

            var target = bot.SensorFleets.Others.FirstOrDefault(e => e.ID == _targetToChase);
            if (target != null)
            {
                // Steer aggressively toward where they are heading (predictive synchronous boost)
                var relativeVelocity = target.Momentum - myFleet.Momentum;
                var predictedPosition = target.Center + (relativeVelocity * 10f);
                
                bot.Cursor.SetTarget(predictedPosition);
                
                // Boost to pursue!
                long elapsed = bot.GameTime - _chaseStartTime;
                if (elapsed > 150 && bot.CanBoost) // slight human reaction delay before hitting boost key
                {
                    bot.Boost();
                }
            }
        }
    }
}
