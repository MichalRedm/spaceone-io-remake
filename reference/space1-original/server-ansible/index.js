var //Ansible = require('./ansible'),
    Ansible2 = require('./ansible2'),
    Replay = require('./replay.js'),
    http = require("http"),
    //Robot = require('./robot.js'),
    //hexdump = require('hexdump-nodejs'),
    SpectateServer = require('./spectate.js'),
    //Reader = require('./decoders/reader'),
    //SendNick = require('./decoders/client/sendnick'),
    //VariableHeader = require('./decoders/variableheader'),
    fs = require('fs');

var ansible2 = new Ansible2();
ansible2.start();

var replay = new Replay();
replay.start({maestroPort: 8013});


// list recordings
var server = http.createServer(function(request, response) {

    response.setHeader('Access-Control-Allow-Origin', '*');
	response.setHeader('Access-Control-Request-Method', '*');
	response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
	response.setHeader('Access-Control-Allow-Headers', '*');
	if (request.method === 'OPTIONS' ) {
		response.writeHead(200);
		response.end();
		return;
    }
        
  response.writeHead(200, {"Content-Type": "application/json"});

  var index = [];

  fs.readdir('./record/playback', (err, files) => {
    files.forEach(file => {

       //console.log('index list');
       //console.log(file);

       var stats = fs.statSync('./record/playback/' + file);
       var fileSizeInBytes = stats.size;
       var fileSizeInMegabytes = fileSizeInBytes / 1024.0 / 1024.0;
       var date = new Date(stats.ctime);
       var size = Math.floor(fileSizeInMegabytes*100)/100;

       if (size > 1 && index.length < 30)
        index.push({
            id: file,
            display: date.toDateString() + ' ' + size,
            size: size
        });
    });

    index.sort();
    index.reverse();

    var connections = {};
    for(var region in Ansible2.Connections)
    {
        var regionConnections = Ansible2.Connections[region];

        for(var i=0; i<regionConnections.length; i++)
        {
            var connection = regionConnections[i];

            if (!connections[region])
                connections[region] = [];

            connections[region].push(connection.data);
        }
    }
    response.write(JSON.stringify({index: index, spectate: connections}));

    response.end();
  })
});

server.listen(8012);


var spectateServer = new SpectateServer();
spectateServer.start();
