var Sensor = require('./sensor'),
    Fleet = require('./fleet');

class FleetsSensor extends Sensor
{
    initialize(robot) {
        super.initialize(robot);
        this.fleets = {};
        this.myFleet = false;
    }

    sense(game) {
        super.sense(game);

        this.newFleets = [];
        this.removedFleets = [];

        this.discoverFleets(game);
        this.pruneFleets(game);
        
        this.processFleets();
    }

    processFleet(fleet)
    {
        fleet.step();

        if (fleet.isMyFleet)
            this.myFleet = fleet;
    }

    processFleets()
    {
        this.myFleet = false;

        this.foreachFleet(function(fleet) {
            this.processFleet(fleet);
        });
    }

    discoverFleets(game)
    {
        for(var i=0; i<game.fleets.length; i++)
        {
            var fleetUpdate = game.fleets[i];
            var fleetKey = `F${fleetUpdate.id}`;
            var knownFleet = false;
            
            if (this.fleets[fleetKey])
                knownFleet = this.fleets[fleetKey]
            else
            {
                this.newFleets.push(fleetKey);
                knownFleet = new Fleet(fleetKey);
            }

            knownFleet.now = game.now;
            knownFleet.fleetUpdate = fleetUpdate;

            this.fleets[fleetKey] = knownFleet;
        }
    }

    foreachFleet(callback)
    {
        for(var fleetKey in this.fleets)
            if (this.fleets.hasOwnProperty(fleetKey))
                callback.apply(this, [this.fleets[fleetKey]]);
    }

    pruneFleets(game)
    {
        var purgeList = [];
        this.foreachFleet(function(fleet) {
            if (fleet.now != game.now)
                purgeList.push(fleet.fleetKey);
        });

        for (var i=0; i<purgeList.length; i++)
        {
            var fleetKey = purgeList[i];
            var knownFleet = this.fleets[fleetKey];

            if (knownFleet.now != game.now)
            {
                this.removedFleets.push(fleetKey);
                delete this.fleets[fleetKey];
            }
        }
    }
}

module.exports = FleetsSensor;