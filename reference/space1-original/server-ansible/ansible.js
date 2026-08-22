var WebSocket = require('ws'),
    util   = require('util'),
    extend   = require('util')._extend,
    hexdump = require('hexdump-nodejs'),
    EventEmitter = require('events').EventEmitter;

var Ansible = function() { }

Ansible.nextID = 1;

util.inherits(Ansible, EventEmitter);

Ansible.prototype.start = function(options) { 
    try {
    var spike = this;
    var config = {
        // us-east
        backends: {
            nae: 'ws://flocks-maestro-live-v1-3-1920190237.us-east-1.elb.amazonaws.com:8080/ws',
            eu: 'ws://flocks-maestro-live-v1-3-722654420.eu-central-1.elb.amazonaws.com:8080/ws',
            naw: 'ws://flocks-maestro-live-v1-3-1528271590.us-west-1.elb.amazonaws.com:8080/ws',
            wonderland: 'ws://flocks-maestro-stag.space1.io:8080/ws',
            dev: 'ws://flocks-maestro-dev.space1.io:8081/ws',
        },
        maestroPort: 8014,
        apiPort: 4242
    };
    extend(config, options);

    var proxyServer = new WebSocket.Server({
        port: config.maestroPort
    });

    var origUpgrade = proxyServer.handleUpgrade;
    proxyServer.handleUpgrade = function(req, socket, head, cb) {
        
        socket.url = req.url; // stashing this for later
        origUpgrade.apply(this, [req, socket, head, cb]);
    };
    
    proxyServer.on('connection', function(clientConnection) {
        try
        {

            console.log('connection for ' + clientConnection._socket.url);
            var serverConnection = new WebSocket(config.backends[clientConnection._socket.url.substring(4)]);
            //serverConnection.binaryType = 'nodebuffer';
            var pending = false;
            var ready = false;


            console.log('new connection');
            clientConnection.on("error", function() {
                try {
                    spike.emit('disconnected', clientConnection);
                } catch (e) {}
                try { clientConnection.close();} catch (e) {}
                try { serverConnection.close();} catch (e) {}
                
            });
            serverConnection.on("error", function() {
                try {
                    spike.emit('disconnected', clientConnection);
                } catch (e) {}
                try { clientConnection.close();} catch (e) {}
                try { serverConnection.close();} catch (e) {}
            });

            serverConnection.on('open', function() {
                try
                {
                    console.log('connection proxied');
                    
                    util.inherits(clientConnection, EventEmitter);
                    clientConnection.nick = false;            
                    clientConnection.id = Ansible.nextID;
                    Ansible.nextID = Ansible.nextID+1;

                    spike.emit('connected', clientConnection);
                    if (pending)
                        serverConnection.send(pending);

                    ready = true;
                    pending = false;
                } catch (e) {
                    try {
                        spike.emit('disconnected', clientConnection);
                    } catch (e) {}
                    try { clientConnection.close();} catch (e) {}
                    try { serverConnection.close();} catch (e) {}
                }
            });

            serverConnection.on('close', function() {
                try {
                    spike.emit('disconnected', clientConnection);
                } catch (e) {}
                try { clientConnection.close();} catch (e) {}
                try { serverConnection.close();} catch (e) {}
            })

            clientConnection.on('message', function(message) {
                try {
                    spike.emit('fromclient', message, clientConnection);

                    if (ready)
                    {
                        if (serverConnection.readyState === WebSocket.OPEN)
                        {
                            serverConnection.send(message);
                        }
                        else
                        {
                            console.log(`client connection closed: ${clientConnection.readyState}`);
                            try { clientConnection.close();} catch (e) {}
                            try { serverConnection.close();} catch (e) {}
                            try {
                                spike.emit('disconnected', clientConnection);
                            } catch (e) {}
                                        return;
                        }
                    }
                    else
                        pending = message;
                }
                catch (e)
                {
                    console.log('exception: ' + e);
                    console.log( e.stack );
                    console.log('offending packet');
                    console.log(hexdump(message));
                    serverConnection.close();
                    serverConnection.close();
                }
            });

            serverConnection.on('message', function incoming(message) {
                try {
                    if (clientConnection.readyState === WebSocket.OPEN)
                    {
                        clientConnection.send(message);
                    }
                    else
                    {
                        console.log(`server connection closed: ${serverConnection.readyState}`);
                        try { clientConnection.close();} catch (e) {}
                        try { serverConnection.close();} catch (e) {}
                        try {
                            spike.emit('disconnected', clientConnection);
                        } catch (e) {}
                                return;
                    }

                    spike.emit('fromserver', message, clientConnection);

                }
                catch (e)
                {
                    console.log('exception: ' + e);
                    console.log( e.stack );
                    console.log('offending packet');
                    console.log(hexdump(message));
                    try { clientConnection.close();} catch (e) {}
                    try { serverConnection.close();} catch (e) {}
                try {
                        spike.emit('disconnected', clientConnection);
                    } catch (e) {}
                }
            });
        }
        catch (e)
        {
            console.log('exception: ' + e);
            console.log( e.stack );
            try { clientConnection.close();} catch (e) {}
            try { serverConnection.close();} catch (e) {}
try {
                spike.emit('disconnected', clientConnection);
            } catch (e) {}
    
        }
    });
} catch (e) {}
}

module.exports = Ansible;
