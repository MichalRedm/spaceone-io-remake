var Robot = require('./robot.js'),
    FollowLeader = require('./behaviors/followleader'),
    FleetsSensor = require('./sensors/fleets');

class RobotBasic extends Robot
{
    constructor()
    {
        super();
        this.name = 'RobotBasic';
        this.target = { x: 0, y: 0 };

        this.color = Robot.RED;
        this.wireEvents();

        this.fleets = new FleetsSensor(this);

        this.addSensor(this.fleets);
    }

    onConnected() {
        this.spawn(this.name);
    }

    onSpawned() {
        console.log(`[${this.name}] Hooray! I\'m alive`);
    }

    onDied()
    {
        console.log('Awww snap, I\'m dead.');
        this.spawn(this.name);
    }

    onUpdate()
    {
        if (this.fleets.myFleet)
            this.angle = Math.atan2(
                this.target.y-this.fleets.myFleet.center.y,
                this.target.x-this.fleets.myFleet.center.x
            );
         
        if (Math.random() < 0.02)
            this.randomAdjustment = (Math.random() * 0.6) - 0.3;

        if (this.randomAdjustment)
            this.angle += this.randomAdjustment;

        this.shoot();

    }

    onYouKilled(killed)
    {
        console.log(`I killed: ${killed.name}`);
    }

    wireEvents() {
        this.on('connected', this.onConnected);
        this.on('spawned', this.onSpawned);
        this.on('died', this.onDied);
        this.on('update', this.onUpdate);
        this.on('youkilled', this.onYouKilled);
    }
}

module.exports = RobotBasic;