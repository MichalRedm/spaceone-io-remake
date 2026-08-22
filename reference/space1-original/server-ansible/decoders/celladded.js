var
    Reader = require('./reader');

var CellAdded = function(reader)
{
	this.type = 'celladded';
    this.x = reader.nextUInt32();
    this.id = reader.nextUInt32();
}

module.exports = CellAdded;