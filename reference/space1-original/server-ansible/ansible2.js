var WebSocket = require('ws'),
    util   = require('util'),
    extend   = require('util')._extend,
    hexdump = require('hexdump-nodejs'),
    EventEmitter = require('events'),

    ServerParser = require('./decoders/server/serverparser'),
    Reader = require('./decoders/reader'),
    WorldUpdate = require('./decoders/server/worldupdate'),
    Leaderboard = require('./decoders/server/leaderboard'),
    YouKilled = require('./decoders/server/youkilled'),
    
    fs = require('fs');

var Ansible2 = function() { }

Ansible2.nextID = 1;

util.inherits(Ansible2, EventEmitter);

Ansible2.Connections = {
    eu: [],
    west: [],
    east: [],
    wonderland: [],
    tourn: []
};

Ansible2.prototype.start = function(options) { 

    setInterval(function() {
        for (var server in Ansible2.Connections)
        {
            var connections = Ansible2.Connections[server];
            var update = [];
            for (var i=0; i<connections.length; i++)
            {
                if (connections[i].readyState == 3)
                    connections[i].shutdown();

                var data = connections[i].data;
                if (data)
                {
                    console.log(data);
                    update.push(data);
                }
            }
            var json = JSON.stringify(update);

            for (var i=0; i<connections.length; i++)
            {
                try {
                    connections[i].send(json);
                } catch (e)
                {
                    console.log(e);
                }
            }
        }
    }, 1000);
}

module.exports = Ansible2;
