var WebSocket = require('ws'),
    EventEmitter = require('events');

class Robot extends EventEmitter 
{
    constructor(url)
    {
        super();
        this.isAlive = false;
        this.name = 'Robot';
        this.angle = 0.1;
        this.color = 0;

        this.behaviors = [];
        this.sensors = [];

        var self = this;

        this.everySecond = setInterval(function() {
            self.sendAngle(true);
            self.sendPing();
        }, 1000);
    }

    sense(game)
    {
        for(var i=0; i<this.sensors.length; i++)
            this.sensors[i].sense(game);
    }

    behave(game)
    {
        for(var i=0; i<this.behaviors.length; i++)
            this.behaviors[i].behave(game);
    }

    addSensor(sensor)
    {
        this.sensors.push(sensor);
        sensor.initialize(this);
    }

    send(obj)
    {
        this.wsBot.send(JSON.stringify(obj));
    }

    split()
    {
        this.send({
            type:'split'
        });
    }

    sendPing()
    {
        this.send({
            type:'ping'
        });
    }

    sendAngle(force)
    {
        if (this.isAlive)
        {
            // only send the value if it's changed or if we are forced to
            if ((this._lastAngle != this.angle) || force)
            {
                this._lastAngle = this.angle;

                //console.log('angle:' + this.angle);
                var x = Math.cos(this.angle) * 100;
                var y = Math.sin(this.angle) * 100;

                this.send({
                    type:'target',
                    x: x,
                    y: y,
                    angle: this.angle
                });
            }
        }
    }

    shoot()
    {
        this.send({
            type:'shoot'
        });
    }

    spawn()
    {
        this.send({
            type:'sendnick',
            name: this.name,
            color: this.color
        });
    }


    update(game)
    {
        this.game = game;
        game.now = new Date();

        var myFleet = false;
        for(var i=0; i<game.fleets.length && !myFleet; i++)
            myFleet = game.fleets[i].isMyFleet;

        this.emit('update');
        if (myFleet && !this.isAlive)
        {
            this.isAlive = true;
            this.emit('spawned');
        } 
        else if (!myFleet && this.isAlive)
        {
            this.isAlive = false;
            this.emit('died');
        }

        this.sendAngle();

        this.sense(game);
        this.behave(game);
    }

    youkilled(killed)
    {
        this.emit('youkilled', killed);
    }

    start(url)
    {
        url = url || 'http://localhost:4242';
        var self = this;
        self.wsBot = new WebSocket(url);
        self.wsBot.on('message', function(message)
        {
            var obj = JSON.parse(message);
            switch(obj.type)
            {
                case 'youkilled':
                    self.youkilled(obj);
                    break;
                case 'worldupdate':
                    self.update(obj);
                    break;
                case 'leaderboard':
                    self.leaders = obj;
                    break;
                case 'connected':
                    console.log('received connected');
                    self.emit('connected');
                    break;
            }
        });

        self.wsBot.on('close', function()
        {
            self.emit('disconnected');
            self.wsBot.close();
        });
    }
}

Robot.BLUE = 0;
Robot.CYAN = 1;
Robot.GREEN = 2;
Robot.ORANGE = 3;
Robot.PURPLE = 4;
Robot.YELLOW = 5;
Robot.RED = 6;

module.exports = Robot;