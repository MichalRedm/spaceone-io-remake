var WebSocket = require('ws'),
    util   = require('util'),
    extend   = require('util')._extend,
    hexdump = require('hexdump-nodejs'),
    fs = require('fs'),
    EventEmitter = require('events').EventEmitter,
    Reader = require('./decoders/reader'),
    VariableHeader = require('./decoders/variableheader');

var Replay = function() { }

util.inherits(Replay, EventEmitter);

var sendSmallPacket = function(connection, bytes)
{
    connection.send(new Buffer(bytes));
}

Replay.prototype.start = function(options) { 
    var spike = this;
    var config = {
        maestroPort: 8013
    };
    extend(config, options);

    var replayServer = new WebSocket.Server({
        port: config.maestroPort
    });

    var sendStream = function(clientConnection, filename)
    {
        fs.readFile(filename, function (err, buffer) {
            var position = 0;
            var offset = false;
            var packetNumber = 0;

            var intervalHandle = setInterval(function() {
                try
                {
                    while (position < buffer.length)
                    {
                        //console.log (hexdump(buffer, 0, 16));

                        var high = buffer.readUInt32LE(position + 0);
                        var low = buffer.readUInt32LE(position + 4);
                        var length = buffer.readUInt32LE(position + 8);

                        var ticks = high * 0x100000000 + low;

                        var date = new Date();
                        var nowTicks = date.getTime();

                        date.setTime(ticks);

                        if (!offset)
                            offset = nowTicks - ticks;

                        if (nowTicks - ticks < offset)
                        {
                            //console.log([false, nowTicks, ticks, offset]);
                            break;
                        }

                        //console.log(ticks);
                        var message = buffer.slice(position+12, position+12+length);
                        var reader = new Reader(message);
                        var header = new VariableHeader(reader);
                        if (header.messageType != 0x60)
                        {
                            clientConnection.send(message);
                            
                            console.log('Packet: ' + packetNumber);
                            //console.log(hexdump(message));
                        }
                        else
                            console.log('skipping pong');


                        position += 12 + length;
                        packetNumber++;
                        
                    }
                }
                catch (e)
                {
                    clearInterval(intervalHandle);
                    return;
                }
            }, 15);
        });
    };
    var origUpgrade = replayServer.handleUpgrade;
    replayServer.handleUpgrade = function(req, socket, head, cb) {
        
        socket.url = req.url; // stashing this for later
        origUpgrade.apply(this, [req, socket, head, cb]);
    };

    replayServer.on('connection', function(clientConnection) {
        var handshake = false;
        console.log('connection for ' + clientConnection._socket.url);

        clientConnection.on('message', function(message) {
            try {
                var reader = new Reader(message);
                var header = new VariableHeader(reader, true);
                if (header.messageType == 0x21)
                {
                    console.log('sync pong');
                    sendSmallPacket(clientConnection,
                        [0x08, 0x01, 0x12, 0x06, 0xC2, 0x01,
                            0x03, 0x0A, 0x01, 0x60]);
                }

                
                if (!handshake)
                {
                    setTimeout(function() {
                        try {
                            sendStream(clientConnection, 'record' + clientConnection._socket.url);
                        }
                        catch (e)
                        {
                            clientConnection.close();
                        }
                    }, 2000);

                    handshake = true;
                }


            }
            catch (e)
            {
                console.log('exception: ' + e);
                console.log( e.stack );
                console.log('offending packet');
                console.log(hexdump(message));
            }
        });
    });
}

module.exports = Replay;