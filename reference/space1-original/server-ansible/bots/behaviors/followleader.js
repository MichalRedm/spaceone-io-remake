class FollowLeader
{
    constructor(robot)
    {
        this.robot = robot;
    }

    behave()
    {
        var bot = this.robot;
        if (bot.game)
            if (bot.game.leader)
                bot.target = bot.game.leader;
    }
}

module.exports = FollowLeader;