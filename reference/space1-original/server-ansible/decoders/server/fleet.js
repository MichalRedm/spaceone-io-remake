var Fleet = function(reader)
{
    this.type = 'fleet';
    this.id = reader.nextUInt32();
    this.fleetSizeOnServer = reader.nextUInt16();

    // Boid central position
    this.bcx = reader.nextInt32();
    this.bcy = reader.nextInt32();

    // Boid front Position
    this.dbfx = reader.nextDouble();
    this.dbfy = reader.nextDouble();

    //Boid front T Position
    this.bftx = reader.nextInt32();
    this.bfty = reader.nextInt32();

    this.foodsEaten = reader.nextInt32();
    this.boidsDestroyed = reader.nextInt32();

    this.flags = reader.nextUInt16();
    this.isSpawnProtected = reader.nextUInt8();

    this.color = { r: 0xFF, g:0xFF, b:0xFF };
	this.hasColor = this.flags & 1;
	this.hasName = this.flags & 2;
	this.isDashing = this.flags & 4;
	
	if(this.hasColor){
		this.color.r = reader.nextUInt8();
		this.color.g = reader.nextUInt8();
		this.color.b = reader.nextUInt8();
	}

	this.selectedSet = reader.nextUInt8();

	this.dashTicks = 0;
	if(this.isDashing) this.dashTicks = reader.nextInt32();

    this.name = this.hasName ? reader.nextUTF8String() : "";

	this.leaderboardPosition = reader.nextUInt32();
	this.score = reader.nextUInt32();

    this.isMyFleet = reader.nextUInt8() == 1;
}

module.exports = Fleet;