console.log('Initializing');

var wsHook = {};
(function() {
  var after = wsHook.after = function(e, url) {
    return e;
  };
  wsHook.resetHooks = function() {
    wsHook.before = before;
    wsHook.after = after;
  }

  var _WS = WebSocket;
  WebSocket = function(url, protocols) {
    var WSObject;
    this.url = url;
    this.protocols = protocols;
    if (!this.protocols)
      WSObject = new _WS(url);
    else
      WSObject = new _WS(url, protocols);

    // Events needs to be proxied and bubbled down.
    var onmessageFunction;
    WSObject.__defineSetter__('onmessage', function(func) {
      onmessageFunction = func;
    });
    WSObject.addEventListener('message', function(e) {
      wsHook.after(e, this.url);
      onmessageFunction.apply(this, [e])
    });

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


// Converts from degrees to radians.
Math.radians = function(degrees) {
  return degrees * Math.PI / 180;
};
 
// Converts from radians to degrees.
Math.degrees = function(radians) {
  return radians * 180 / Math.PI;
};

var angle = 0;
var init = false;
var ctx;

var initialize = function() {
    if (!init)
    {
        var io = window.IO;

        if (io)
        {
            io.OrigHandleOnPlayerDeath = io.HandleOnPlayerDeath;
            io.HandleOnPlayerDeath = function() {

                console.log('aw snap, i\'m dead');
                io.OrigHandleOnPlayerDeath();
                if (!restartScheduled)
                {
                    setInterval(function() {
                        restartScheduled = false;
                        enterGame();

                    }, 4000);
                    restartScheduled = true;
                }
            };

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
                    render();
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
var game = false;
var bullets = [];
var ahead, ahead2;
var COLLISION_RADIUS = 600;
var restartScheduled = false;
var shoot = false;
var closest = 5000;
var closestIndex = false;
var myFleet = false;

var highlight = false;
var highlight2 = false;

var distance = function(x1, y1, x2, y2)
{
    return Math.sqrt(Math.pow(x2-x1,2)+Math.pow(y2-y1,2));
}

var recentlyTargetedFood = [];

setInterval(function() {
    recentlyTargetedFood = [];
}, 1000);

var lastX, lastY;

var locked = false;
var shotTimer, shotTimerCount;

var shoot = function()
{
    locked = true;
    setTimeout(function() {
        core.shoot();
    }, 150);

    setTimeout(function() {
        locked = false;
        if (unlocked != false)
            unlocked();
        unlocked = false;
    }, 200);
};

var unlocked = false;
var targetedFleetID = -1;
var avoid = false;
var mostThreatening = false;
var memory = {};
var objects = [];

var render = function()
{

    //try
    //{
    if (ctx)
    {
        if (!game.fleets) return;
        
        ctx.fillStyle = 'green';
        ctx.fillRect(lastX, lastY, 10, 10);

        if (highlight)
        {
            //console.log(`highlighting ${highlight.x} ${highlight.y}`);
            //ctx.fillRect(highlight.x-10, highlight.y-10, 20, 20);
            ctx.beginPath();
            ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
            ctx.arc(highlight.x,highlight.y, 40, 0, 2*Math.PI);
            ctx.fill();

            if (highlight2)
            {
                ctx.beginPath();
                ctx.moveTo(highlight.x, highlight.y);
                ctx.lineTo(highlight2.x, highlight2.y);
                ctx.strokeStyle = "rgba(0, 255, 0, 0.5)";
                ctx.lineWidth = 5;
                ctx.stroke();
            }
        }


        /*
        if (ahead)
        {
            ctx.fillRect(ahead.x, ahead.y, 10, 10);
            ctx.fillRect(ahead2.x, ahead2.y, 10, 10);

            ctx.beginPath();
            if (avoid && avoid.x != 0 && avoid.y != 0)
            {
                ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
                ctx.arc(myFleet.bcx + avoid.x, myFleet.bcy + avoid.y,50, 0, 2*Math.PI);
                ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
            }
            else            
                ctx.fillStyle = "rgba(255, 255, 255, 0.2)";

            ctx.arc(ahead.x,ahead.y,COLLISION_RADIUS, 0, 2*Math.PI);
            ctx.fill();
        }*/

        /*
        ctx.beginPath();
        if (jumpZoneObjects() > 0)
            ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
        else            
            ctx.fillStyle = "rgba(255, 255, 255, 0.2)";

        var landing = findLanding();
        ctx.arc(landing.x,landing.y,300, 0, 2*Math.PI);
        ctx.fill();
        */

        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        for(var i=0; i<bullets.length; i++)
        {
            var bullet = bullets[i];
            ctx.beginPath();
            if (bullet.approaching)
                ctx.fillStyle = "rgba(255, 0, 0, 1)";
            else                
                ctx.fillStyle = "rgba(0, 255, 0, 0.2)";

            ctx.arc(bullet.x, bullet.y, 10, 0, 2*Math.PI);
            ctx.fillText(bullet.fleetID, bullets[i].x+10, bullets[i].y);
            ctx.fill();

        }
        

        ctx.font = "30px Arial";
        
        for(var i=0; i<game.fleets.length; i++)
        {
            var fleet = game.fleets[i];
            //if (fleet.isMyFleet)
              //  continue;

            ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            ctx.fillText(`{${fleet.bcx}, ${fleet.bcy }}`, fleet.bcx + 50, fleet.bcy + 50);

            ctx.beginPath();
            ctx.strokeStyle = "rgba(0, 255, 0, 0.5)";
            ctx.lineWidth = 25;
            ctx.moveTo(fleet.bcx, fleet.bcy);
            ctx.lineTo(fleet.bcx + 30*fleet.mx, fleet.bcy + 30*fleet.my);
            ctx.stroke();

            ctx.beginPath();
            if (fleet.canFire)
            {
                ctx.strokeStyle = "rgba(255, 0, 0, 1)";

                ctx.lineWidth = 10;
                ctx.moveTo(fleet.min.x, fleet.min.y);
                ctx.lineTo(fleet.min.x, fleet.max.y);
                ctx.lineTo(fleet.max.x, fleet.max.y);
                ctx.lineTo(fleet.max.x, fleet.min.y);
                ctx.lineTo(fleet.min.x, fleet.min.y);
                ctx.stroke();
            }            

            if (fleet.f)
            {
                ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
                ctx.arc(fleet.x, fleet.y, fleet.f.deltaM, 0, 2*Math.PI);
                ctx.fill();
            }

            for (var c=0; c<fleet.cells.length; c++)
            {
                var cell = fleet.cells[c];

                if (!cell.isSplitting)
                {

                    /*ctx.beginPath();
                    ctx.moveTo(cell.x, cell.y);
                    ctx.lineTo(cell.x + 30*cell.velX, cell.y + 30*cell.velY);
                    ctx.strokeStyle = "rgba(0, 255, 0, 0.5)";
                    ctx.lineWidth = 5;
                    ctx.stroke();*/
                }

                /*ctx.fillText(JSON.stringify({
                    isSplitting: cell.isSplitting,
                    isDashing: cell.isDashing,
                    isInDecay: cell.isInDecay,
                    isFood: cell.isFood,
                }), cell.x, cell.y);*/
            }
        }
    }
    //}    catch (e) {}
};

var teamMate = false;
var lastKnown = {x: -4000 + Math.random()*500-250, y: -4000 + Math.random()*500-250};
//var lastKnown = {x: 0 + Math.random()*500-250, y: -4000 + Math.random()*500-250};
//var lastKnown = false;



var findLanding = function()
{
    var momentum = {x: myFleet.mx * 50, y: myFleet.my * 50};
    return vec_add(myFleet, momentum);
}

var inJumpZone = function(point)
{
    var landing = findLanding();
    return distance(point.x, point.y, landing.x, landing.y) < 300;
}

var jumpZoneObjects = function()
{
    var cnt = 0;
    for(var i=0; i<objects.length; i++)
        if (inJumpZone(objects[i]))
            cnt++;

    return cnt;
}

var jumpZeroObjects = function()
{
    var cnt = 0;
    for(var i=0; i<objects.length; i++)
        if (distance(objects[i].x, objects[i].y, myFleet.x, myFleet.y) < 300)
            cnt++;

    return cnt;
}

var processGame = function()
{
    if (!game || !game.fleets)
        return;

    myFleet = false;
    for(var q=0; q<game.fleets.length; q++)
    {
        var fleet = game.fleets[q];
        if(fleet.isMyFleet)
            myFleet = fleet;

        var key = `fleet${fleet.id}`;

        var f;
        if (memory.hasOwnProperty(key))
            f = memory[key];
        else
        {
            f = {
                positions: [],
                mHistory: []
            };
        }
        memory[key] = f;

        var min = {x:99999, y:99999};
        var max = {x:-99999, y:-99999};
        var avg = {x:0, y:0};
        var cnt = 0.0;
        for(var c=0; c<fleet.cells.length; c++)
        {
            var cell = fleet.cells[c];
            if (!cell.isSplitting && !cell.isBullet)
            {
                avg.x += cell.x;
                avg.y += cell.y;

                min.x = Math.min(min.x, cell.x);
                min.y = Math.min(min.y, cell.y);

                max.x = Math.max(max.x, cell.x);
                max.y = Math.max(max.y, cell.y);
                
                cnt++;
            }
        }

        avg.x = 1.0 * avg.x / cnt;
        avg.y = 1.0 * avg.y / cnt;

        center = {
            x: (1.0 * min.x + max.x) /2.0, 
            y: (1.0 * min.y + max.y) /2.0
        };

        fleet.x = fleet.bcx = center.x;
        fleet.y = fleet.bcy = center.y;

        fleet.min = min;
        fleet.max = max;
        fleet.cnt = cnt;
        fleet.f = f;

        f.positions.push({x:fleet.bcx, y:fleet.bcy});
        while(f.positions.length > 5)
            f.positions.shift();

        if (f.positions.length > 4)
        {
            var p = f.positions;

            fleet.mx = 
                  (p[4].x + p[3].x + p[2].x)/3.0
                - (p[3].x + p[2].x + p[1].x)/3.0

            fleet.my =
                  (p[4].y + p[3].y + p[2].y)/3.0
                - (p[3].y + p[2].y + p[1].y)/3.0

        }

        f.mHistory.push({x:fleet.mx, y:fleet.my});
        while(f.mHistory.length > 10)
            f.mHistory.shift();

        var h = f.mHistory;
        var total = 0;

        for(var x=1; x<h.length; x++)
            total += Math.abs(h[x].x - h[x-1].x)
                + Math.abs(h[x].y - h[x-1].y);

        f.deltaM = total;

        if (fleet.fired)
        {
            f.fired = fleet.fired;
            f.reloadTime = (450 + cnt *36);
            f.reloaded = f.fired + f.reloadTime;

        }

        if (game.now > f.reloaded)
        {
            fleet.canFire = true;
            fleet.reloadStatus = 100;
        }
        else
            fleet.reloadStatus = Math.min(100, Math.floor((f.reloaded - game.now) / f.reloadTime * 100));
            
    }

    for (var i=0; i<bullets.length; i++)
    {
        var bullet = bullets[i];

        bullet.distance1 = bullet.distance2;
        bullet.distance2 = bullet.distance3;
        bullet.distance3 = distance(bullet.x, bullet.y, myFleet.bcx, myFleet.bcy);

        bullet.approaching = bullet.distance3 < bullet.distance1;
    }
    
    //highlight = {x: myFleet.bcx, y: myFleet.bcy };

    //console.log([myFleet.bcx, myFleet.bcy, locked]);

    
    if (!locked)
    {

        var othersInRange = false;

        teamMate = false;
        for(var q=0; q<game.fleets.length; q++)
        {
            var fleet = game.fleets[q];
            if (!fleet.isMyFleet)
            {
                if (true
                    //&& fleet.leaderboardPosition == 1
                    //&& fleet.name == myFleet.name
                    && fleet.name.indexOf('NA,') > -1
                )
                {
                    teamMate = fleet;
                    //lastKnown = teamMate;
                    highlight = teamMate;
                }
                else
                    othersInRange = true;
            }
        }

        avoid = collisionAvoidance(myFleet);

        othersInRange = false;
        for(var i=0; i<objects.length; i++)
            if (distance(objects[i].x, objects[i].y, myFleet.x, myFleet.y) < 650)
                othersInRange = true;

        // follow the leader... or go home
        if (teamMate || lastKnown)// && distance(teamMate.bcx, teamMate.bcy, myFleet.bcx, myFleet.bcy))
        {
            if (teamMate)
            {
                if (teamMate.id < myFleet.id)
                    p = -1
                else
                    p = 1;

                game.leader = {x: teamMate.x + (p *300), y: teamMate.y + (p *300) };
            }
            else
                game.leader = {x: lastKnown.x, y: lastKnown.y};
        }
        else
        {
            if (!game.shouldRenderLeader)
                game.leader = {x:0, y:0};
        }

        angle = Math.atan2(game.leader.y - myFleet.y, game.leader.x - myFleet.x);

        // be unpredictable
        if (othersInRange || (avoid.x != 0 || avoid.y != 0))
        {
            if (Math.random() < 0.08)
                angle = Math.random() * 2.0 * Math.PI - Math.PI;

            //console.log('calling collisionAvoidance');
            if (avoid.x != 0 || avoid.y != 0)
            {
                angle = Math.atan2(avoid.y, avoid.x);
                highlight = mostThreatening;
                highlight2 = myFleet;
            }
        }

        if (game.isDangerZone)
        {
            angle = Math.atan2(-myFleet.bcy, - myFleet.bcx);
            console.log("AAHHH! out of bounds!");
        }

        //game.canFire = false;
        if (!game.canFire && !shotTimer)
        {
            shotTimer = game.now;
            shotTimerCount = 0;
            for(var i=0; i<myFleet.cells.length; i++)
                if (!myFleet.cells[i].isBullet && !myFleet.cells[i].isSplitting)
                    shotTimerCount++;
        }

        if (game.canFire)
        {
            if (shotTimer)
            {
                //console.log(`ShotTiming\t${shotTimerCount}\t${game.now - shotTimer}`);
                shotTimer = 0;
            }

            if (game.fleets.length > 0)
            {
                closest = 5000.0;
                closestIndex = -1;

                for(var q=0; q<game.fleets.length; q++)
                {
                    var fleet = game.fleets[q];

                    if (
                        !fleet.isMyFleet 
                        && fleet.id != teamMate.id 
                        && fleet.name != myFleet.name
                        && fleet.name.indexOf('Our Corner') == -1
                        //&& fleet.f.deltaM < 25
                    )
                    {
/*
                        // if we have a teammate, let's try not to shoot them.
                        if (teamMate)
                        {
                            var teamMateAngle = Math.atan2(teamMate.y-myFleet.y, teamMate.x-myFleet.x);
                            var targetAngle = Math.atan2(fleet.y-myFleet.y, fleet.x-myFleet.x);

                            var teamMateDistance = distance(teamMate.x, teamMate.y, myFleet.x, myFleet.y);
                            var targetDistance = distance(fleet.x, fleet.y, myFleet.x, myFleet.y);

                            if (teamMateDistance < 500 
                                && Math.abs(targetAngle - teamMate) < (.4 * Math.PI)
                            )
                            {
                                console.log(`passing on shot at ${fleet.name} to not hit teammate`);
                                continue;
                            }
                        }*/

                        var range = distance(myFleet.bcx, myFleet.bcy, fleet.bcx, fleet.bcy);
                        if (range < closest)
                        {
                            closest = range;
                            closestIndex = q;
                        }
                    }
                }

                if (closest < 5000)
                    console.log(`closest: ${closest}`);

                if (closestIndex > -1)
                {
                    if (//closest < 1000
                        true
                        && (!mostThreatening 
                            || distance(mostThreatening.x, mostThreatening.y, myFleet.x, myFleet.y) > 50))
                    {
                        fleet = game.fleets[closestIndex];

                        angle = Math.atan2(fleet.bcy - myFleet.bcy, fleet.bcx - myFleet.bcx);
                        targetedFleetID = fleet.id;

                        if (
                            true
                            && Math.random() < .7 
                            && closest < 300 
                            && jumpZoneObjects() < myFleet.cnt 
                            && myFleet.cnt > 3)
                        {
                            /*if (Math.random() < 0.4)
                            {
                                shoot();
                            }*/
                            console.log(`prep Jump closest: ${closest} myFleet.fleetSizeOnServer: ${myFleet.cells.length}`);
                            core.splitAndDash();
                            locked = true;
                            setTimeout(function() {
                                locked = false;                                
                                shoot();                        
                            }, 200);
                        }
                        else
                            shoot();


                        unlocked = function() {
                            angle = Math.random() * 2.0 * Math.PI - Math.PI;
                            highlight = false;
                        }
                    }
                }
            }


            if (!locked && !othersInRange)
            {
                // shoot food along the way
                if (game.food.length > 0) // && myFleet.cells.length < 25)
                {
                    for(var q=0; q<game.food.length; q++)
                    {
                        var food = game.food[q];

                        if (!recentlyTargetedFood.includes(food.id))
                        {
                            recentlyTargetedFood.push(food.id);
                            console.log('shooting food');

                            angle = Math.atan2(food.y - myFleet.bcy, food.x - myFleet.bcx);
                            
                            shoot();
                            break;
                        }

                    }
                }
            }

        }
        else
        {
            //console.log('cooling: '+ game.cooldownPerc);
        }

        //console.log(game.leader);
    }
    else
    {
        for(var q=0; q<game.fleets.length; q++)
        {
            var fleet = game.fleets[q];
            highlight = false;
            //highlight2 = false;

            if (fleet.id == targetedFleetID)
            {
                angle = Math.atan2(fleet.bcy - myFleet.bcy, fleet.bcx - myFleet.bcx);

                highlight = {x: fleet.bcx, y: fleet.bcy };

                //console.log('target locked on!');
                var cumX = 0, cumY = 0;
                var count = 0;

                var cell;

                for(var c=0; c<fleet.cells.length; c++)
                {
                    if (!fleet.cells[c].isSplitting)
                    {
                        cell = fleet.cells[c];
                        cumX += fleet.cells[c].velX;
                        cumY += fleet.cells[c].velY;
                        count++;
                    }
                }

                var avgX = cumX / fleet.cells.length;
                var avgY = cumY / fleet.cells.length;

                // skip the avg, try a single cell
                //avgX = cell.velX;
                //avgY = cell.velY;
                avgX = fleet.mx;
                avgY = fleet.my;
                
                //var bulletSpeed = distance(17, 4, 0, 0);
                //console.log(`old buletSpeed=${bulletSpeed} for fleet ${myFleet.cnt} `);
                
                var bulletSpeed = 
                    -7.9776375 * Math.pow(10, -4) * Math.pow(myFleet.cnt, 3) 
                    +0.063481471 * Math.pow(myFleet.cnt, 2) 
                    -1.819772979 * myFleet.cnt
                    +33.94877102;
                
                console.log(`estimating buletSpeed=${bulletSpeed} for fleet ${myFleet.cnt} `);
                

                //highlight2 = vec_add({x:fleet.bcx, y:fleet.bcy}, vec_mul({x: avgX, y: avgY }, 80));

                // calculate the vector from our center to their center
                var enemyVec = vec_sub({x: fleet.bcx, y: fleet.bcy}, {x: myFleet.bcx, y: myFleet.bcy});
                // measure the "distance" the bullet will travel
                var dist = vec_mag(enemyVec);
                // adjust for target position based on the amount of "time units" to travel "dist"
                // and the targets speed vector
                enemyVec = vec_add(enemyVec, vec_mul({x: avgX, y: avgY}, dist/bulletSpeed));
                // calculate trajectory of bullet
                var bulletTrajectory = vec_mul(vec_normal(enemyVec), bulletSpeed);
                // assign values
                //bulletSprite.speedX = bulletTrajectory.x;
                //bulletSprite.speedY = bulletTrajectory.y;  
                angle = Math.atan2(bulletTrajectory.y, bulletTrajectory.x);


                break;


                //console.log(`X: ${avgX} Y: ${avgY} angle: ${Math.degrees(angle)} angleOfFleet: ${Math.degrees(angleOfFleet)} angleOfAxis: ${Math.degrees(angleOfAxis)}`);

                //console.log(game);
                //angle = angle+ .4*(angleOfAxis-angleOfFleet);
            }
        }
    }

    if (window.canvas)
    {
        initialize();
        if (game && window.core)
        {
            var width = canvas.offsetWidth;
            var height = canvas.offsetHeight;

            var x = Math.cos(angle) * 100 + width/2;
            var y = Math.sin(angle) * 100 + height/2;


            if (x != lastX || y != lastY)
            {
                core.setTarget(x, y);
                lastX = x;
                lastY = y;
            }

        }
    }
    
}


function vec_mag(vec) { // get the magnitude of the vector
  return Math.sqrt( vec.x * vec.x + vec.y * vec.y); 
 }
function vec_sub(a,b) { // subtract two vectors
  return { x: a.x-b.x, y: a.y-b.y };
}
function vec_add(a,b) { // add two vectors
  return { x: a.x + b.x, y: a.y + b.y };
}
function vec_mul(a,c) { // multiply a vector by a scalar
  return { x: a.x * c, y: a.y * c };
}
function vec_div(a,c) { // divide == multiply by 1/c
  return vec_mul(a, 1.0/c);
}
function vec_normal(a) { // normalize vector
  return vec_div(a, vec_mag(a)); 
}

wsHook.after = function(messageEvent, url) {
    try
    {
        dv = new DataView(messageEvent.data, 0);
        offset = 0;

        /*
        var b = [];
        for (i=0; i<messageEvent.data.byteLength; i++)
        {
            try
            {
                b.push(nextUInt8());
            } catch (e) {}
        }
        console.log(b);
        */
            
        offset = 12;
        var type = nextUInt8();

        if (type == 16)
        {
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

                            console.log(`Actual Bullet\t\t${size}\t${cell.velX}\t${cell.velY}\t${distance(cell.velX, cell.velY, 0,0)}`);
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

        processGame();

    }
    catch (e)
    {
        //if (e.toString().indexOf('bounds of the Data') == -1)
            console.log("Exception: " + e.message);
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

    //if (cell.isBullet)
        //console.log(cell);
    
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


var collisionAvoidance = function(myFleet) {
    var MAX_SEE_AHEAD = 50;
    var position = {x: myFleet.bcx, y: myFleet.bcy };

    var cell = null;
    for(var i=0; i<myFleet.cells.length; i++)
    {
        var c = myFleet.cells[i];
        if (!c.isInDecay)
        {
            cell = c;
            break;
        }
    }
    var velocity = vec_normal({x: cell.velX, y: cell.velY});
    
    ahead = vec_add(position, vec_mul(vec_normal(velocity), MAX_SEE_AHEAD));
    ahead2 = vec_add(position, vec_mul(vec_normal(velocity), MAX_SEE_AHEAD*0.5));

    /*console.log('position');
    console.log(position);
    console.log('ahead');
    console.log(ahead);
    console.log(ahead2);*/
 
    mostThreatening = findMostThreateningObstacle(ahead, ahead2, myFleet);
    //if (mostThreatening)
        //console.log(`most threatening: ${mostThreatening}`)
    var avoidance = {x: 0, y: 0};

    if (mostThreatening != null) {
        //console.log(`most threatening: ${mostThreatening.x} ${mostThreatening.y}`)
        avoidance.x = ahead.x - mostThreatening.x;
        avoidance.y = ahead.y - mostThreatening.y;
 
        avoidance = vec_normal(avoidance);
        avoidance = vec_mul(avoidance, 20);

        var avoidanceAngle = Math.atan2(avoidance.y, avoidance.x);
        if (
            true &&
            Math.abs(
                avoidanceAngle
                - Math.atan2(mostThreatening.velY, mostThreatening.velX)
            ) < .2 * Math.PI
            && distance(mostThreatening.x, mostThreatening.y, myFleet.x, myFleet.y) > 40
        )
        {

            /*newAvoidanceAngle = avoidanceAngle + .2 * Math.PI;
            avoidance.x = Math.cos(newAvoidanceAngle);
            avoidance.y = Math.sin(newAvoidanceAngle);
            avoidance = vec_normal(avoidance);
            avoidance = vec_mul(avoidance, 20);

            console.log (`evasive action! ${avoidanceAngle} ${newAvoidanceAngle}`);
            var avoidanceAngle = Math.atan2(avoidance.y, avoidance.x);*/
            console.log('RUN AWAY! RUN AWAY!');
            
        }
        else
        {
            var delta =             
                avoidanceAngle
                - Math.atan2(mostThreatening.velY, mostThreatening.velX);

            //console.log(`evasion delta: ${delta} ${avoidanceAngle}`);
            //console.log(mostThreatening);

        }
        

        
        
    } else {
        avoidance = vec_mul(avoidance, 0);
    }
 
    return avoidance;
}


var minDistance;

var lineIntersectsCircle = function (ahead, ahead2, cell) {
    if ((distance(cell.x, cell.y, ahead2.x, ahead2.y) <= COLLISION_RADIUS))
        return true;

    if ((distance(cell.x, cell.y, ahead.x, ahead.y) <= COLLISION_RADIUS))
        return true;
}

var findMostThreateningObstacle = function(ahead, ahead2, myFleet) {
    var mostThreatening = null;
    var collision = false;

    minDistance = 9999;

    objects = [];
    for (var b = 0; b < bullets.length; b++)
    {
        objects.push(bullets[b]);
        /*objects.push({
            x: bullets[b].x + bullets[b].x*8,
            y: bullets[b].y + bullets[b].y*8,
        })*/
    }

    /*for (var f = 0; f < game.fleets.length; f++)
    {
        var fleet = game.fleets[f];
        if (fleet != myFleet && fleet != teamMate)
            if (fleet.reloadStatus > 40)
                for(var i=0; i<fleet.cells.length; i++)
                {
                    objects.push(fleet.cells[i]);
                    if (!fleets.cells.isBullet)
                        fleet.cells[i].approaching = true;
                }
    }*/

    for (var b = 0; b < objects.length; b++) {
        var cell = objects[b];
        //console.log(cell);
        //console.log('distance to bullet ' + distance(cell.x, cell.y, myFleet.bcx, myFleet.bcy));

        collision = lineIntersectsCircle(ahead, ahead2, cell);

        //if (collision)
          //  console.log('COLLISION PREDICTED!');

        // "position" is the character's current position
        if (cell.approaching && collision && 
            (
                mostThreatening == null 
                || distance(myFleet.bcx, myFleet.bcy, cell.x, cell.y) 
                    < distance(myFleet.bcx, myFleet.bcy, mostThreatening.x, mostThreatening.y
            )
        )) {
            mostThreatening = cell;
        }
    }
    return mostThreatening;
}


/*
 * object.watch polyfill
 *
 * 2012-04-03
 *
 * By Eli Grey, http://eligrey.com
 * Public Domain.
 * NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.
 */

// object.watch
if (!Object.prototype.watch) {
	Object.defineProperty(Object.prototype, "watch", {
		  enumerable: false
		, configurable: true
		, writable: false
		, value: function (prop, handler) {
			var
			  oldval = this[prop]
			, newval = oldval
			, getter = function () {
				return newval;
			}
			, setter = function (val) {
				oldval = newval;
				return newval = handler.call(this, prop, oldval, val);
			}
			;
			
			if (delete this[prop]) { // can't watch constants
				Object.defineProperty(this, prop, {
					  get: getter
					, set: setter
					, enumerable: true
					, configurable: true
				});
			}
		}
	});
}

// object.unwatch
if (!Object.prototype.unwatch) {
	Object.defineProperty(Object.prototype, "unwatch", {
		  enumerable: false
		, configurable: true
		, writable: false
		, value: function (prop) {
			var val = this[prop];
			delete this[prop]; // remove accessors
			this[prop] = val;
		}
	});
}

window.onkeypress = function(e) {
    if (e.which == 80 || e.keyCode == 80)
    {
        core.sendEnterGameRequest("FxskJaP3", true);
    }
}
/*
setTimeout(function() {
    connectToMaestro = function(env, isReconnect)
    {
        console.log('redirecting connection');
        var url = "ws://v-vm01.internal:8014/ws";

        isReconnect ? 
            core.reconnect(url) : core.connectToMaestro(url);
    }
}, 1);*/