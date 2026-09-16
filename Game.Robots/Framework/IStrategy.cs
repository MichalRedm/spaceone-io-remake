namespace Game.Robots.Framework
{
    public interface IStrategy
    {
        float EvaluateUtility(HumanoidBot bot);
        void Execute(HumanoidBot bot);
    }
}
