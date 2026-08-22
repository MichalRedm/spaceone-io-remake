var Cell = function(reader)
{
    this.type = 'cell';
	this.id = reader.nextUInt32();

	this.x = reader.nextInt32();
	this.y = reader.nextInt32();
    
    this.velX = reader.nextInt32();
    this.velY = reader.nextInt32();
    
    this.alpha = reader.nextDouble();
    
    this.armor = reader.nextUInt8();
    
	this.radius = reader.nextInt16();	

	this.flags = reader.nextInt16();
    this.isFood = (this.flags & 1) != 0;
    this.isBullet = (this.flags & 2) != 0;

    if (this.isBullet) {
		this.bulletLife = reader.nextInt32();
		this.maxBulletLife = reader.nextInt32();
    }
	
	this.decayTick = 0;
	this.decayTotalTick = 0;
	this.isInDecay = (this.flags & 4) != 0;
	this.isSplitting = (this.flags & 8) != 0;
	this.shouldExplode = (this.flags & 16) != 0;
    
	if(this.isInDecay) 
	{
		this.decayTick = reader.nextInt16();
		this.decayTotalTick = reader.nextInt16();
	}

}

module.exports = Cell;