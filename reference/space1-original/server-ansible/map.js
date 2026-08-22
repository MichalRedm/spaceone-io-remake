var WebSocket = require('ws'),
    util   = require('util'),
    extend   = require('util')._extend,
    hexdump = require('hexdump-nodejs'),
    fs = require('fs'),
    EventEmitter = require('events').EventEmitter,
    Reader = require('./decoders/reader'),
    ServerParser = require('./decoders/server/serverparser'),
    VariableHeader = require('./decoders/variableheader');

var parser = new ServerParser();
var filename = '../ww.s1';

fs.readFile(filename, function (err, buffer) {
    var position = 0;
    var offset = false;
    var packetNumber = 0;

    var playerName = false;
    var leaderName = false;

    while (position < buffer.length)
    {
        var high = buffer.readUInt32LE(position + 0);
        var low = buffer.readUInt32LE(position + 4);
        var length = buffer.readUInt32LE(position + 8);

        var ticks = high * 0x100000000 + low;

        var date = new Date();

        date.setTime(ticks);
        var decoded = parser.parse(buffer, position+12);

        if (decoded.type == 'worldupdate')
        {
            for(var i=0; i<decoded.fleets.length; i++)
            {
                var fleet = decoded.fleets[i];
                if (fleet.isMyFleet)
                {
                    if (fleet.name != playerName)
                    {
                        playerName = fleet.name;
                    }
                    break;
                }
            }
        }
        else if (decoded.type == 'leaderboard')
        {
            leaderName = decoded.ranks[0].name;
            leaders = [];

            for (var i=0; i<decoded.ranks.length; i++)
            {
                leaders.push(decoded.ranks[i].name);
                leaders.push(decoded.ranks[i].score);
            }

            console.log(date.toTimeString() + ',' + leaders.join(','));
        }

        position += (12 + length);
        packetNumber++;
    
    }


});
