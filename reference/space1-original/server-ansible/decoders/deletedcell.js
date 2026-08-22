var
    Reader = require('./reader');

var DeletedCell = function(reader)
{
	this.type = 'deletedcell';
    this.id = reader.nextUInt32();
    this.flags = reader.nextUInt8();
}

module.exports = DeletedCell;