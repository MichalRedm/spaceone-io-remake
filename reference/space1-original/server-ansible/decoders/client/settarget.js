var
    Reader = require('./reader');

var SetTarget = function(reader)
{
	this.type = 'settarget';
	this.x = reader.nextUInt32();
	this.y = reader.nextUInt32();
	this.angle = reader.nextDouble();
}

module.exports = SetTarget;

/*
dissection of this "set target" message from the client

  Offset  00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F
00000000  00 00 00 1A 08 01 12 16 C2 01 13 0A 11 10 90 FA  ........Â.....�ú
00000010  FF FF 73 F8 FF FF 29 03 12 1D 7B C4 C5 BF        ÿÿsøÿÿ)...{ÄÅ¿


explained below

00 00 00 // excellence byte[3]
1A // length 26 (vbyte)
08 01 12 // matches the 3 byte header from the messages sent from the server
16 // length 22 (vbyte)
C2 01 // ?
13 // length 19 (vbyte)
0A // ?
11 // length 17 (vbyte)
10 // msgtype uint8
90 FA FF FF // x uint32
73 F8 FF FF // y uint32
29 03 12 1D 7B C4 C5 BF // angle double
*/