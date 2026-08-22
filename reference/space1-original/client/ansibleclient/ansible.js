var ansibleEnabled = true;
var ansibleConnection = false;
var peerList = false;

var distance = function(x1, y1, x2, y2)
{
    return Math.sqrt(Math.pow(x2-x1,2)+Math.pow(y2-y1,2));
}

var updatePeers = function(peers)
{
    peerList.empty();
    
    for(var i=0; i<peers.length; i++)
    {
        var peer = peers[i];

        if (currentServer != "default")
        {
            if (peer.idFleet != myFleet.id && peer.size > 0)
            {
                peerList.append(document.createTextNode('peer: '));
                var angle = Math.atan2(peer.y - myFleet.bcy, peer.x - myFleet.bcx);
                angle = angle * 180 / Math.PI;
                var range = distance(myFleet.bcx, myFleet.bcy, peer.x, peer.y);

                peerList.append($(
                    '<a href="#">'
                        + peer.nick 
                        + ' <div class="peerpointer" style="transform: rotate(' + angle + 'deg);">→</div>'
                        + ' <div class="peerrange">' + Math.floor(range) + '</div>'
                        + '</a><br>'));
            }
        }
    }
}

newConnection = function(url)
{
    if (ansibleEnabled)
    {
        if (ansibleConnection)
        {
            try
            {
                ansibleConnection.close();
            }
            catch (e) {}
        }

        //ansibleConnection = new _WS("ws://v-vm01:8019/" + currentServer);
        ansibleConnection = new _WS("ws://ansible.violetdata.com/record/" + currentServer);
        
        ansibleConnection.onmessage = function(message) {
            var peers = JSON.parse(message.data);
            updatePeers(peers);
        }
    }
}

var pending = [];

ansible = function(messageEvent)
{
    if (ansibleEnabled)
    {
        var buffer = new ArrayBuffer(12 + messageEvent.data.byteLength);
        var dv = new DataView(buffer);

        const int64 = Date.now();
        const MAX_UINT32 = 0xFFFFFFFF;
    
        const high = ~~(int64 / MAX_UINT32);
        const low = (int64 % MAX_UINT32) - high;
    
        dv.setInt32(0, high, true);
        dv.setInt32(4, low, true);
        dv.setInt32(8, messageEvent.data.byteLength, true);

        new Uint8Array(buffer, 0, buffer.byteLength)
            .set(new Uint8Array(messageEvent.data), 12);

        if (ansibleConnection)
        {
            if (ansibleConnection.readyState == 1)
            {
                while (pending.length)
                    ansibleConnection.send(pending.shift());

                ansibleConnection.send(buffer);
            }
            else
                pending.push(buffer);
        }
    }
}

$(function() {
    var list = $('<li></li>');

    list.append(document.createTextNode('ansible: '));
    list.append($('<a href="#">off</a> <a href="#">on</a>'));
    $('#ansiblelinks').append(list);

    peerList = $('<li></li>')
        .addClass('peerlist');
    $('#ansiblelinks').append(peerList);
    
    
    list.find('a').on('click', function(e) {
        ansibleEnabled = ($(this).text() == "on");
        if (!ansibleEnabled)
        {
            if (ansibleConnection)
                try {
                    ansibleConnection.close();
                } catch (e) {}

            ansibleConnection = false
        }
        else
        {
            reconnect();
        }
        e.preventDefault();
    });
});
