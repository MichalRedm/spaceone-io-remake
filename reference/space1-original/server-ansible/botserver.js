var APIServer = require('./apiserver'),
RobotBasic = require('./bots/robotbasic');

var apiServer = new APIServer();
apiServer.start();

var bots = [];

for(var i=0; i<1; i++)
{

    var robot = new RobotBasic();
    robot.start();
    robot.target = { x: i * 10, y: 0};
    robot.name = "Daudelin #" + i;
    //robot.color = Math.floor(Math.random() * 7);
    console.log(robot.name + " " + robot.color.toString());

    bots.push(robot);
}


var up = false;
setInterval(function() {
    for(var i=0; i<bots.length; i++)

        if (bots[i].game)
        {
            if (bots[i].game.leader)
            {
                bots[i].target = bots[i].game.leader;
            }
        }
    up = !up;
}, 80);
