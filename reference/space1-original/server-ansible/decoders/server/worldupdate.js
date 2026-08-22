var
    Cell = require('./cell'),
    DeletedCell = require('./deletedcell'),
    Fleet = require('./fleet');

var WorldUpdate = function(reader)
{
    //console.log('starting world parse');

    this.type = 'worldupdate';
    this.now = (new Date()).getTime();
    this.shouldRenderLeader = reader.nextUInt8();
    if(this.shouldRenderLeader)
    {
        this.leader = {};
        this.leader.x = reader.nextFloat32();
        this.leader.y = reader.nextFloat32();
    }
    
    this.version = reader.nextUTF8String();

    this.drawStarfield = reader.nextUInt8();
    this.isInterpolating = reader.nextUInt8();
    this.numValidBoids = reader.nextUInt16();
    this.isDangerZone = reader.nextUInt8();

    this.cooldownPerc = Math.min(1.0, Math.max(reader.nextDouble(), 0.0));
    this.canFire = this.cooldownPerc == 1.0;

    this.currentFoodForNextBoid = reader.nextUInt8();
    this.foodForNextBoid = reader.nextUInt8();

    this.numFleets = reader.nextUInt32();
    this.fleets = [];
    //console.log('starting world parse.fleets');

    for(var i = 0; i < this.numFleets; i++)
    {
        var fleetSize = reader.nextUInt32();
        if (fleetSize == 0) continue;
        
        //console.log(`starting world parse.fleets[${i}]`);
        var fleet = new Fleet(reader);
        //console.log(`starting world /parse.fleets[${i}]`);
        
        fleet.cells = [];
        this.fleets.push(fleet);

        for(var j = 0; j < fleetSize; j++)
        {
            var cell = new Cell(reader);
            fleet.cells.push(cell);
        }
    }
    //console.log('starting world /parse.fleets');

    //console.log('starting world parse.food');
    //Get food
    this.numOtherCells = reader.nextUInt32();
    //console.log('starting world parse.food other=' + this.numOtherCells);

    this.food = [];
    for(var k = 0; k < this.numOtherCells; k++)
        this.food.push(new Cell(reader));

    //console.log('starting world /parse.food');
    
    //Deleted Cells
    this.numDeleted = reader.nextUInt16();
    this.deleted = [];
    for(var l = 0; l < this.numDeleted; l++)
        this.deleted.push(DeletedCell(reader));

    //console.log('done world parse');

}

module.exports = WorldUpdate;