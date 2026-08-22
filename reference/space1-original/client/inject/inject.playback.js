var override = false;
//override = 'ws://v-vm01:8013/ws';

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
		new_uri += "//" + loc.host + "";
		new_uri += "/playback";

        var url = new_uri + '/' + window.location.hash.substr(1);

		if (override)
            url = override;

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

