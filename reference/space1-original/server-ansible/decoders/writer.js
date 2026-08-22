var Writer = function(buffer)
{
    this.position = 0;
    this.buffer = buffer;
    this.length = buffer.length;
}

Writer.prototype.seek = function(newPosition)
{
    this.position = newPosition;
}

Writer.prototype.nextUInt8 = function(i) {
    this.buffer.writeUInt8(i, this.position);
    this.position += 1;
}

Writer.prototype.nextUInt16 = function(i) {
    this.buffer.writeUInt16LE(i, this.position);
    this.position += 2;
}

Writer.prototype.nextInt16 = function(i) {
    this.buffer.writeInt16LE(i, this.position);
    this.position += 2;
}

Writer.prototype.nextUInt32 = function(i) {
    this.buffer.writeUInt32LE(i, this.position);
    this.position += 4;
}

Writer.prototype.nextInt32 = function(i) {
    this.buffer.writeInt32LE(i, this.position);
    this.position += 4;
}

Writer.prototype.nextFloat32 = function(i) {
    this.buffer.writeFloatLE(i, this.position);
    this.position += 4;
}

Writer.prototype.nextDouble = function(i) {
    this.buffer.writeDoubleLE(i, this.position);
    this.position += 8;
}

Writer.prototype.nextUTF8String = function(str) {
    for(var i=0; i<str.length; i++)
    {
        this.nextUInt8(str.charCodeAt(i));
    }
    this.nextUInt8(0);
}

module.exports = Writer;