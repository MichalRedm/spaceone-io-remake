setTimeout(function() {
    connectToMaestro = function(env, isReconnect)
    {
        console.log('redirecting connection');

        var loc = window.location, new_uri;
        if (loc.protocol === "https:") {
            new_uri = "wss:";
        } else {
            new_uri = "ws:";
        }
        new_uri += "//" + loc.host;
        //new_uri += "/playback";

        //var url = "ws://ec2-54-145-218-102.compute-1.amazonaws.com/playback/" + window.location.hash.substr(1);
        var url = new_uri + '/spectate/' + window.location.hash.substr(1);

        //var url = "ws://v-vm01.internal:8016/" + window.location.hash.substr(1);
        
        isReconnect ?
            core.reconnect(url) : core.connectToMaestro(url);
    }
}, 1);

window.IO.maestroConnected = function()
{
        window.isMaestroConnected = true;
        window.sentArenaLink = undefined;
        enterGame();
};

$(function() {
    $('#container').css('opacity', '0');
});
