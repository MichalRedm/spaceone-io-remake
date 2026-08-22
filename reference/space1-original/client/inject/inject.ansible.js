var override = false;
override = 'ws://v-vm01:8014/ws/' + window.location.hash.substring(1);

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
        new_uri += "/ws/" + window.location.hash.substring(1);

        var url = new_uri;

        if (override)
            url = override;

        isReconnect ? 
            core.reconnect(url) : core.connectToMaestro(url);
    }
}, 1);
