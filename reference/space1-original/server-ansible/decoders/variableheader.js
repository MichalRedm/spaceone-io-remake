var Reader = require('./reader');

var VariableHeader = function(reader, extra)
{
    try
    {
        var threeByteHeaders = extra ? 2 : 1;
        var checkpoint = 'started';

        for (var i=0; i<threeByteHeaders; i++)
        {
            checkpoint = '3byte header ' + i;
            reader.nextUInt8();
            reader.nextUInt8();
            reader.nextUInt8();
            reader.nextVByteInteger();
        }

         checkpoint = '2bytes';
        // 2 bytes
        this.h1 = reader.nextUInt16();

        checkpoint = 'post2bVByte';
        if (reader.nextVByteInteger())
        {
            // 1 byte
            checkpoint = '1byte';
            this.h2 = reader.nextUInt8();
            
            checkpoint = 'vb';
            this.h3 = reader.nextVByteInteger();

            this.hasPayload = reader.position < reader.length;

            if (this.hasPayload)
            {
                checkpoint = 'messageType';
                this.messageType = reader.nextUInt8();
            }
            else
                this.messageType = -1;
        }
    }
    catch (e)
    {

        //console.log('failed to parse variable header, checkpoint: %s', checkpoint);
    }
}

module.exports = VariableHeader;