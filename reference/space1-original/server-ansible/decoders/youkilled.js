var
    Reader = require('./reader');

var YouKilled = function(reader)
{
	this.type = 'youkilled';
	this.name = reader.nextUTF8String();
	this.points = reader.nextUInt32();
}

module.exports = YouKilled;