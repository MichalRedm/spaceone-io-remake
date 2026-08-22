var WebSocket = require('ws'),
    util  = require('util'),
    extend   = require('util')._extend,
    hexdump = require('hexdump-nodejs'),
    ServerParser = require('./decoders/server/serverparser'),
    Writer = require('./decoders/writer'),
    EventEmitter = require('events').EventEmitter;

var APIServer = function() { }

function toUTF8Array(str) {
    var utf8 = [];
    for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
            utf8.push(0xc0 | (charcode >> 6), 
                      0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
            utf8.push(0xe0 | (charcode >> 12), 
                      0x80 | ((charcode>>6) & 0x3f), 
                      0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
            i++;
            // UTF-16 encodes 0x10000-0x10FFFF by
            // subtracting 0x10000 and splitting the
            // 20 bits of 0x0-0xFFFFF into two halves
            charcode = 0x10000 + (((charcode & 0x3ff)<<10)
                      | (str.charCodeAt(i) & 0x3ff))
            utf8.push(0xf0 | (charcode >>18), 
                      0x80 | ((charcode>>12) & 0x3f), 
                      0x80 | ((charcode>>6) & 0x3f), 
                      0x80 | (charcode & 0x3f));
        }
    }
    return utf8;
}

util.inherits(APIServer, EventEmitter);

var sendSmallPacket = function(serverConnection, bytes)
{
    serverConnection.send(new Buffer(bytes));
}

var sendAck2 = function(serverConnection)
{
    sendSmallPacket(serverConnection,
        [0x00, 0x00, 0x00, 0x07, 0x08, 0x01, 0x12, 0x03, 0xC2,
            0x02, 0x00]);
}

var sendAck = function(serverConnection)
{
    sendSmallPacket(serverConnection,
        [0x00, 0x00, 0x00, 0x07, 0x08, 0x01, 0x12, 0x03, 0xB2,
            0x01, 0x00]);
}

var sendStartSession = function(serverConnection)
{
    sendSmallPacket(serverConnection,
        [0x00, 0x00, 0x00, 0x0A, 0x08, 0x01, 0x12, 0x06, 0xC2,
                0x01, 0x03, 0x0A, 0x01, 0xFE]);

}

var sendHello = function(serverConnection) {
    sendSmallPacket(serverConnection,
        [0x00, 0x00, 0x00, 0x10, 0x08, 0x01, 0x12, 0x0C, 0xA2, 
            0x01, 0x09, 0x12, 0x05, 0x31, 0x2E, 0x30, 0x2E, 
            0x30, 0x18, 0x03]
    );
};

var sendPing = function(serverConnection) {
    sendSmallPacket(serverConnection,
        [0x00, 0x00, 0x00, 0x0A, 0x08, 0x01, 0x12, 0x06, 0xC2, 
            0x01, 0x03, 0x0A, 0x01, 0x21]
    );
};

var sendPing2 = function(serverConnection) {
    sendSmallPacket(serverConnection,
        [0x00, 0x00, 0x00, 0x0A, 0x08, 0x01, 0x12, 0x06, 0xC2, 
            0x01, 0x03, 0x0A, 0x01, 0x11]
    );
};

var sendSplit = function(serverConnection) {
    sendSmallPacket(serverConnection,
        [0x00, 0x00, 0x00, 0x0A, 0x08, 0x01, 0x12, 0x06, 0xC2, 
            0x01, 0x03, 0x0A, 0x01, 0x19]
    );
};

var sendShoot = function(serverConnection) {
    sendSmallPacket(serverConnection,
        [0x00, 0x00, 0x00, 0x0A, 0x08, 0x01, 0x12, 0x06, 0xC2, 
            0x01, 0x03, 0x0A, 0x01, 0x11]
    );
};

var sendSetTarget = function(serverConnection, x, y, angle)
{
    var packet = new Buffer([0x00, 0x00, 0x00, 0x1A, 0x08, 0x01, 0x12, 0x16, 0xC2,
        0x01, 0x13, 0x0A, 0x11, 0x10, 0x47, 0x05, 0x00, 
        0x00, 0x6E, 0x02, 0x00, 0x00, 0x56, 0xC1, 0xEE,
        0xD2, 0x8A, 0xB2, 0x03, 0xC0]);

    packet.writeInt32LE(x, packet.length - 16);
    packet.writeInt32LE(y, packet.length - 12);
    packet.writeDoubleLE(Math.atan2(y, x), packet.length - 8);

    sendSmallPacket(serverConnection, packet);
}

var sendNick = function(serverConnection, nick, color)
{
    var nickBytes = toUTF8Array(nick);
    var messagePayloadLength = 1 + nickBytes.length+1 + 1 + 1;

    var buffer = new Buffer(3 + 1 + 3 + 1 + 2 + 1 + 1 + 1 +
        messagePayloadLength);

    var writer = new Writer(buffer);

    writer.nextUInt8(0x0);
    writer.nextUInt8(0x0);
    writer.nextUInt8(0x0);

    writer.nextUInt8(messagePayloadLength+2+3+4);

    writer.nextUInt8(0x8);
    writer.nextUInt8(0x1);
    writer.nextUInt8(0x12);

    writer.nextUInt8(messagePayloadLength+2+3);

    writer.nextUInt8(0xC2);
    writer.nextUInt8(0x01);

    writer.nextUInt8(messagePayloadLength+2);

    writer.nextUInt8(0x0A);

    writer.nextUInt8(messagePayloadLength);

    writer.nextUInt8(0xFD);

    for (var i=0; i<nickBytes.length; i++)
        writer.nextUInt8(nickBytes[i]);
    //writer.nextUTF8String(nick);
    writer.nextUInt8(0);

    writer.nextUInt8(0); // what is this?
    writer.nextUInt8(color);

    serverConnection.send(buffer);        
}


APIServer.prototype.start = function(options) { 
    var spike = this;
    var config = {

        backend: "ws://flocks-maestro-live-v1-3-1920190237.us-east-1.elb.amazonaws.com:8080/ws",
        //backend: "ws://flocks-maestro-live-v1-3-1528271590.us-west-1.elb.amazonaws.com:8080/ws",
        //backend: "ws://flocks-maestro-live-v1-3-722654420.eu-central-1.elb.amazonaws.com:8080/ws",
        //backend: "ws://flocks-maestro-stag.space1.io:8080/ws",
        //backend: "ws://flocks-tour-maestro-v1-3.space1.io:8080/ws",
        //backend: "ws://flocks-maestro-dev.space1.io:8080/ws" // seems dead/gone
        apiPort: 4242
    };
    extend(config, options);

    console.log(config);

    var apiServer = new WebSocket.Server({
        port: config.apiPort
    });

    apiServer.on('connection', function(clientConnection) {
        var serverConnection = new WebSocket(config.backend);
        var serverParser = new ServerParser(this);
        
        serverConnection.on('open', function() {
            try {
                sendHello(serverConnection);
                sendAck(serverConnection);
                sendPing(serverConnection);
                sendStartSession(serverConnection);
                
                clientConnection.send(JSON.stringify({type:'connected'}));
            }
            catch (e)
            {
                console.log('exception: ' + e);
                console.log( e.stack );
                clientConnection.close();
                serverConnection.close();
            }
        });

        serverConnection.on('message', function(message) {
            try {
                var decoded = serverParser.parse(message);
                //console.log(decoded);
                clientConnection.send(JSON.stringify(decoded));
                
            }
            catch (e)
            {
                console.log('exception: ' + e);
                console.log( e.stack );
                console.log('offending packet');
                console.log(hexdump(message));
                clientConnection.close();
                serverConnection.close();
            }
        });

        clientConnection.on('message', function(message) {
            try
            {
                message = JSON.parse(message);
                if (serverConnection.readyState != WebSocket.OPEN)
                {
                    clientConnection.close();
                }
                else
                {
                    switch (message.type)
                    {
                        case "sendnick":
                            sendNick(serverConnection, message.name, message.color);
                            break;
                        case "split":
                            sendSplit(serverConnection);
                            break;
                        case "shoot":
                            sendShoot(serverConnection);
                            break;
                        case "ping":
                            sendPing(serverConnection);
                            break;
                        case "target":
                            sendSetTarget(serverConnection, 
                                message.x,
                                message.y,
                                message.angle);
                            break;
                    }
                }
            }
            catch (e)
            {
                console.log('exception: ' + e);
                console.log( e.stack );
                clientConnection.close();
                serverConnection.close();
            }
        });
    });
}

module.exports = APIServer;