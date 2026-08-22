console.log('Initializing');
var game = false;
var bullets = [];
var myFleet = false;

var ansible = false;
var newConnection = false;
var _WS = false;

var wsHook = {};
(function() {
  var after = wsHook.after = function(e, url) {
    return e;
  };
  wsHook.resetHooks = function() {
    wsHook.before = before;
    wsHook.after = after;
  }

  _WS = WebSocket;
  WebSocket = function(url, protocols) {
    var WSObject;
    this.url = url;
    this.protocols = protocols;
    if (!this.protocols)
      WSObject = new _WS(url);
    else
      WSObject = new _WS(url, protocols);

    if (newConnection)
        newConnection(url);

    // Events needs to be proxied and bubbled down.
    var onmessageFunction;
    WSObject.__defineSetter__('onmessage', function(func) {
      onmessageFunction = func;
    });
    WSObject.addEventListener('message', function(e) {
      wsHook.after(e, this.url);
      onmessageFunction.apply(this, [e])
    });

    var _send = WSObject.send
    WSObject.send = function (data) {
      arguments[0] = wsHook.before(data, WSObject.url) || data
      _send.apply(this, arguments)
    }    

    return WSObject;
  }
})();

var dv;
var offset = 0;

var nextUInt8 = function() {
    var i = dv.getUint8(offset);
    offset += 1;
    return i;
}

var nextUInt16 = function() {
    var i = dv.getUint16(offset, true);
    offset += 2;
    return i;
}

var nextInt16 = function() {
    var i = dv.getInt16(offset, true);
    offset += 2;
    return i;
}

var nextUInt32 = function() {
    var i = dv.getUint32(offset, true);
    offset += 4;
    return i;
}

var nextInt32 = function() {
    var i = dv.getInt32(offset, true);
    offset += 4;
    return i;
}

var nextFloat32 = function() {
    var i = dv.getFloat32(offset, true);
    offset += 4;
    return i;
}

var nextDouble = function() {
    var i = dv.getFloat64(offset, true);
    offset += 8;
    return i;
}

var nextUTF8String = function() {
    var s = "";
    var c = nextUInt8();
    while (c != 0)
    {
        s += String.fromCharCode(c);
        c = nextUInt8();
    }
    return s;
}
var angle = 0;
var init = false;
var ctx;

var initialize = function() {
    if (!init)
    {
        var io = window.IO;

        if (io)
        {
            ctx = document.getElementById('canvas').getContext("2d");
            ctx.fillRectOrig = ctx.fillRect;
            ctx.fillRect = function() {
                if (ctx.lineWidth == 10)
                    ctx.next = 1;

                return ctx.fillRectOrig.apply(this, arguments);
            };

            ctx.translateOrig = ctx.translate;
            ctx.translate = function() {
                var x = ctx.translateOrig.apply(this, arguments);

                if (ctx.next == 2)
                {
                    try
                    {
                        render(ctx, game);
                    }
                    catch (e)
                    {
                        console.log('exception in render');
                        console.log(e);
                    }

                    ctx.next = 0;
                }
                if (ctx.next == 1)
                    ctx.next = 2;

                return x;
            };

            init = true;
        }
    }
};

var ping = false;
var latency = false;

wsHook.before = function(message, url) {
    //[0, 0, 0, 10, 8, 1, 18, 6, -62, 1, 3, 10, 1, 33]
    if (message.length == 14 && message[13] == 33)
    {
        ping = window.performance.now();
        //console.log('ping');
    }
};

wsHook.after = function(messageEvent, url) {
    if (ansible)
        ansible(messageEvent);

    try
    {
        dv = new DataView(messageEvent.data, 0);
        offset = 0;

        if (dv.byteLength == 10 && dv.getInt8(9) == 96) {
            // pong
            if (ping)
            {
                latency = window.performance.now() - ping;
                ping = false;
            }
            //console.log('latency: ' + latency + 'ms');
        }        

        offset = 12;
        var type = nextUInt8();

        if (type == 16) {
            game = {};
            game.now = (new Date()).getTime();

            game.shouldRenderLeader = nextUInt8();
            if(game.shouldRenderLeader)
            {
                game.leader = {};
                game.leader.x = nextFloat32();
                game.leader.y = nextFloat32();
            }
            
            game.version = nextUTF8String();

            game.drawStarfield = nextUInt8();
            game.isInterpolating = nextUInt8();
            game.numValidBoids = nextUInt16();
            game.isDangerZone = nextUInt8();

            game.cooldownPerc = Math.min(1.0, Math.max(nextDouble(), 0.0));
            game.canFire = game.cooldownPerc == 1.0;

            game.currentFoodForNextBoid = nextUInt8();
            game.foodForNextBoid = nextUInt8();

            game.numFleets = nextUInt32();
            game.fleets = [];

            for(var i = 0; i < game.numFleets; i++)
            {
                var fleetSize = nextUInt32();
                if (fleetSize == 0) continue;
                
                var fleet = handleFleetDecoding();
                fleet.cells = [];

                game.fleets.push(fleet);

                var onePerFleet = false;
                for(var j = 0; j < fleetSize; j++)
                {
                    
                    var cell = handleCellDecoding();
                    if (cell.isBullet && fleet.isMyFleet)
                        if (!onePerFleet)
                        {
                            var size = 0;
                            for(var c=0; c<fleet.cells.length; c++)
                                if (!fleet.cells[c].isSplitting)
                                    size++;

                            //console.log(`Actual Bullet\t\t${size}\t${cell.velX}\t${cell.velY}\t${distance(cell.velX, cell.velY, 0,0)}`);
                            onePerFleet = true;
                        }
                    
                    if (cell.isBullet && !fleet.isMyFleet)
                    {
                        if (!onePerFleet)
                        {
                            var size = 0;
                            for(var c=0; c<fleet.cells.length; c++)
                                if (!fleet.cells[c].isSplitting)
                                    size++;

                            //console.log(`Bullet\t${size}\t${cell.velX}\t${cell.velY}`);
                            onePerFleet = true;
                        }
                        
                        bullets.push(cell);
                        cell.firstSeen = game.now;
                        cell.fleetID = fleet.name;
                        fleet.fired = game.now;
                        //console.log(cell);
                    }

                    fleet.cells.push(cell);
                }
            }

            //Get food
            game.numOtherCells = nextUInt32();

            game.food = [];
            for(var k = 0; k < game.numOtherCells; k++)
                game.food.push(handleCellDecoding());
            
            //Deleted Cells
            game.numDeleted = nextUInt16();
            game.deleted = [];
            for(var l = 0; l < game.numDeleted; l++)
                game.deleted.push(handleDeletedCellsDecoding());

            //console.log(game);

            var inView = [];
            for(var i=0; i<game.fleets.length; i++)
            {
                var fleet = game.fleets[i];

                inView.push(fleet.name);
            }
            //console.log(inView);

            //console.log('canvas: ' + canvas.offsetWidth);
    
        }
        //else
        //    console.log('unknown message type:' + type);


        var oldBullets = bullets;
        bullets = [];
        game.bullets = bullets;
        for (var i=0; i<oldBullets.length; i++)
        {
            var bullet = oldBullets[i];

            if (!bullet.lastUpdate)
                bullet.lastUpdate = game.now;
            
            var elapsedTime = 1.0 * game.now - bullet.lastUpdate;
            var posIncX = elapsedTime * (bullet.velX/40.0);
            var posIncY = elapsedTime * (bullet.velY/40.0);

            bullet.x = bullet.x + posIncX;
            bullet.y = bullet.y + posIncY;
            //console.log(`bullet time: id=${bullet.id} ${bullet.x}+${posIncX} ${bullet.y}+${posIncY}`);
            bullet.lastUpdate = game.now;

            //bullet.maxBulletLife = bullet.maxBulletLife-1;
            //if (bullet.maxBulletLife > -1)
                //bullets.push(bullet);

            //if (game.now - cell.firstSeen > 10000)
              //  bullet.deleted = true;
                
            if (!bullet.deleted)
                bullets.push(bullet);

        }

        //console.log(game.now);
        initialize();

        try
        {
            processGame(game);
        }
        catch (e)
        {
            console.log('exception in processGame');
            console.log(e);
        }
    }
    catch (e)
    {
        if (e.toString().indexOf('bounds of the Data') == -1)
            console.log("Exception: " + e);
    }
}


var handleFleetDecoding = function()
{
    var fleet = {
        id: nextUInt32(),
        fleetSizeOnServer: nextUInt16(),

        // Boid central position
        bcx: nextInt32(),
        bcy: nextInt32(),

        // Boid front Position
        dbfx: nextDouble(),
        dbfy: nextDouble(),

    	//Boid front T Position
        bftx: nextInt32(),
        bfty: nextInt32(),

        foodsEaten: nextInt32(),
        boidsDestroyed: nextInt32(),

        flags: nextUInt16(),
        isSpawnProtected: nextUInt8(),

        color: {
            r: 0xFF, 
            g: 0xFF, 
            b: 0xFF
        },
    }
    
	fleet.hasColor = fleet.flags & 1;
	fleet.hasName = fleet.flags & 2;
	fleet.isDashing = fleet.flags & 4;
	
	if(fleet.hasColor){
		fleet.color.r = nextUInt8();
		fleet.color.g = nextUInt8();
		fleet.color.b = nextUInt8();
	}

	fleet.selectedSet = nextUInt8();

	fleet.dashTicks = 0;
	if(fleet.isDashing) fleet.dashTicks = nextInt32();

	var name;
	if(fleet.hasName)
	{
		fleet.name = nextUTF8String();
	}

	fleet.leaderboardPosition = nextUInt32();
	fleet.score = nextUInt32();

    fleet.isMyFleet = nextUInt8() == 1;
    
    return fleet;
    
}

var handleCellDecoding = function(fleet)
{
    var cell = {};
	cell.id = nextUInt32();

	cell.x = nextInt32();
	cell.y = nextInt32();
    
    cell.velX = nextInt32();
    cell.velY = nextInt32();
    
    cell.alpha = nextDouble();
    
    cell.armor = nextUInt8();
    
	cell.radius = nextInt16();	

	cell.flags = nextInt16();
    cell.isFood = cell.flags & 1;
    cell.isBullet = cell.flags & 2;

    if (cell.isBullet) {
		cell.bulletLife = nextInt32();
		cell.maxBulletLife = nextInt32();
    }
	
	cell.decayTick = 0;
	cell.decayTotalTick = 0;
	cell.isInDecay = cell.flags & 4;
	cell.isSplitting = cell.flags & 8;
	cell.shouldExplode = cell.flags & 16;
    
	if(cell.isInDecay) 
	{
		cell.decayTick = nextInt16();
		cell.decayTotalTick = nextInt16();
	}

    return cell;
}

var handleDeletedCellsDecoding = function(justLostMyCell)
{
    var cell = {};
    
    cell.id = nextUInt32();
    cell.flags = nextUInt8();

    for(var i=0; i<bullets.length; i++)
        if (bullets[i].id == cell.id)
            bullets[i].deleted = true;
    
    return cell;
}
