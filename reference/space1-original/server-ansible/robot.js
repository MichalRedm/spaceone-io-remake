var WebSocket = require('ws');

var Robot = function()
{}

Robot.prototype.start = function()
{
    var wsBot = new WebSocket('http://localhost:4242');

    wsBot.on('message', function(message)
    {
        var obj = JSON.parse(message);

        if (obj.type == 'worldupdate')
        {
            var found = false;

            for(var i=0; i<obj.fleets.length; i++)
            {
                var fleet = obj.fleets[i];

                if (fleet.isMyFleet)
                {
                    console.log([fleet.bcx, fleet.bcy, fleet.cells.length]);

                    if (Math.random() < .03)
                    {
                        console.log('splitting');
                        wsBot.send(JSON.stringify({
                            type:'split'
                        }));
                    }
                    found = true;
                }
            }

            if (!found)
                console.log('no fleet among: ' + obj.fleets.length);
        }
    });
}

module.exports = Robot;