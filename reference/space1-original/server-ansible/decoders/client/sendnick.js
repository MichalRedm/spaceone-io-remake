var
    Reader = require('../reader');

var SendNick = function(reader)
{
    this.type = 'sendnick';
    this.name = reader.nextUTF8String();
    this.x = reader.nextUInt8();
    this.colorSelection = reader.nextUInt8();
}

module.exports = SendNick;
