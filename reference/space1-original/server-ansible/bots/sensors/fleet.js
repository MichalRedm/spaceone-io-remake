class Fleet
{
    constructor(fleetKey)
    {
        this.fleetKey = fleetKey;
        this.name = false;
        this.isMyFleet = false;
    }

    step()
    {
        var update = this.fleetUpdate;
        this.name = update.name;
        this.isMyFleet = update.isMyFleet;
        this.center = {
            x: update.bcx,
            y: update.bcy
        };

        this.size = 0;
        for (var i=0; i<update.cells.length; i++)
        {
            var cell = update.cells[i];

            if (!cell.isFood
                && !cell.isBullet
                && !cell.isInDecay
                && !cell.isSplitting)

                this.size++;
        }
    }
}

module.exports = Fleet;