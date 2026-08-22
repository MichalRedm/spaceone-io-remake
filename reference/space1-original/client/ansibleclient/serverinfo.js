
var space1Servers = {
    east: "ws://flocks-maestro-live-v1-3-1920190237.us-east-1.elb.amazonaws.com:8080/ws",
    west: "ws://flocks-maestro-live-v1-3-1528271590.us-west-1.elb.amazonaws.com:8080/ws",
    eu: "ws://flocks-maestro-live-v1-3-722654420.eu-central-1.elb.amazonaws.com:8080/ws",
    wonderland: "ws://flocks-maestro-stag.space1.io:8080/ws",
    west2: "ws://flocks-tour-maestro-v1-3.space1.io:8080/ws",
    //dev: "ws://flocks-maestro-dev.space1.io:8080/ws" // seems dead/gone
}

var currentServer = "east";

var url = space1Servers[currentServer];

setTimeout(function() {
    connectToMaestro = function(env, isReconnect)
    {
        isReconnect ? 
            core.reconnect(url) : core.connectToMaestro(url);
    }
}, 1);

var reconnect = function()
{
    changeServer(currentServer);
}

var changeServer = function(newServer)
{
    currentServer = newServer;

    console.log('changing server to:' + newServer);
    console.log(window.awsRegionCode);
    url = space1Servers[newServer];
    console.log('url: ' + url);
    
    core.reconnect(url);

    window.IO.HandleOnPlayerDeath();
}

$(function() {
    var latencyDisplay = $('<li></li>');
    $('#ansiblelinks').append(latencyDisplay);

    setInterval(function() {
        latencyDisplay.text('lag: ' + (latency ? (Math.floor(latency*100)/100) + ' ms': 'n/a'));
    }, 1000);


    var list = $('<li></li>')
        .addClass('serverlinks');

    list.append(document.createTextNode('server: '));

    $('#ansiblelinks').append(list);
    $.each(space1Servers, function(key, value) {
        list.append($('<a href="#">' + key + '</a>'));
    });

    list.find('a').on('click', function(e) {
        changeServer($(this).text());
        e.preventDefault();
    });
});
