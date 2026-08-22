var EventEmitter = require('events');

class Sensor extends EventEmitter
{
    initialize(robot)
    {
        this.robot = robot;
    }
    sense(game) {}
}

module.exports = Sensor;