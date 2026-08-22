var
    FastIntegerCompression = require("fastintcompression");

var Reader = function(buffer)
{
    this.position = 0;
    this.buffer = buffer;
    this.length = buffer.length;
}

Reader.prototype.seek = function(newPosition)
{
    this.position = newPosition;
}

Reader.prototype.nextUInt8 = function() {
    var i = this.buffer.readUInt8(this.position);
    this.position += 1;
    return i;
}

Reader.prototype.nextUInt16 = function() {
    var i = this.buffer.readUInt16LE(this.position);
    this.position += 2;
    return i;
}

Reader.prototype.nextInt16 = function() {
    var i = this.buffer.readInt16LE(this.position);
    this.position += 2;
    return i;
}

Reader.prototype.nextUInt32 = function() {
    var i = this.buffer.readUInt32LE(this.position);
    this.position += 4;
    return i;
}

Reader.prototype.nextInt32 = function() {
    var i = this.buffer.readInt32LE(this.position);
    this.position += 4;
    return i;
}

Reader.prototype.nextFloat32 = function() {
    var i = this.buffer.readFloatLE(this.position);
    this.position += 4;
    return i;
}

Reader.prototype.nextDouble = function() {
    var i = this.buffer.readDoubleLE(this.position);
    this.position += 8;
    return i;
}

Reader.prototype.nextUTF8String = function() {
    var s = "";
    var bytes = [];
    var c = this.nextUInt8();
    while (c != 0)
    {
        bytes.push(c);
        c = this.nextUInt8();
    }

    var encodedString = String.fromCharCode.apply(null, new Uint8Array(bytes)),
        decodedString = decodeURIComponent(escape(encodedString));

    return decodedString;
}

Reader.prototype.nextVByteInteger = function() {
    var buf = [];
    var i = 256;
    while(i > 127)
    {
        i = this.nextUInt8();
        buf.push(i);
    }

    var ints = FastIntegerCompression.uncompress(buf);
    return ints[0];
}

Reader.prototype.nextVBytePrefixedHeader = function()
{
    var headerLength = this.nextVByteInteger();
    var header = [];
    for(var i=0; i<headerLength; i++)
        header.push(this.nextUInt8());
    
    return header;
}

module.exports = Reader;