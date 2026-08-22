var hexdump = require('hexdump-nodejs'),
    util   = require('util'),
    Reader = require('./reader'),
    WorldUpdate = require('./worldupdate'),
    SetTarget = require('./settarget'),
    Borders = require('./borders'),
    Leaderboard = require('./leaderboard'),
    VariableHeader = require('./variableheader'),
    YouKilled = require('./youkilled'),
    SendNick = require('./sendnick'),
    Split = require('./split'),
    InitSession = require('./initsession'),
    CellAdded = require('./celladded'),
    EventEmitter = require('events').EventEmitter;

var FromServerParser = function(spike)
{
    var self = this;

    spike.on('fromserver', function(message) {
        self.ParseMessage(message);
    });
}
util.inherits(FromServerParser, EventEmitter);

FromServerParser.prototype.ParseMessage = function(message)
{
    try 
    {
        var reader = new Reader(message);
        var header = new VariableHeader(reader);
        //console.log("server");
        //console.log(hexdump(message));

        switch (header.messageType)
        {
            case 0x10: // World Update
                var worldUpdate = new WorldUpdate(reader);
                //console.log('worldupdate');

                this.emit('worldupdate', worldUpdate);

                break;

            case 0x20: // pong
                this.emit('pong');
                break;

            case 0x14: // ClearMyCells
                this.emit('clearcache');
                break;

            case 0x31: // Leaderboard
                var leaderboard = new Leaderboard(reader);
                //console.log(leaderboard);
                this.emit('leaderboard', leaderboard);

                break;

            case 0x50: // YouKilled
                var youKilled = new YouKilled(reader);
                //console.log(youKilled);
                this.emit('youkilled', youKilled);

                break;

            case 0x60: 
            case 0x11: 
            case 0x12: 
            case 0x21: 
                // occasional message with payload = 0
                // one of the cache clears?
                break;

            case 0x51: // cell added
                var cellAdded = new CellAdded(reader);
                console.log(cellAdded);

                this.emit('celladded', cellAdded);
                
                break;

            case 0x40: // borders
                var borders = new Borders(reader);
                console.log(borders);

                this.emit('borders', borders);
                
                break;

            default:
                console.log(header);
                console.log('S: %s unparsed\n' + hexdump(message), header.messageType);
        }
    }
    catch (e)
    {
        console.log('exception: ' + e);
        console.log( e.stack );
        console.log('offending packet');
        console.log(hexdump(message));
    }    
}

var FromClientParser = function(spike)
{
    spike.on('fromclient', function(message) {
        try
        {
            var reader = new Reader(message);
            //console.log("client");
            //console.log(hexdump(message));
            var header = new VariableHeader(reader, true);
            if (header.messageType)
            {

                switch (header.messageType)
                {
                    case 0x10:
                        var setTarget = new SetTarget(reader);
                        //console.log(setTarget);
                        break;

                    case 0x11:  // zero byte messages... one is ping.. other ?
                    case 0x21:  
                        break;

                    case 0x31: // geo request?
                        // 6 byte payload sent on connection
                        // gets GEO IP estimation response
                        break;

                    case 0xFD:
                        var sendNick = new SendNick(reader);
                        console.log(sendNick);
                        
                        break;

                    case 0xFE:
                        var initSession = new InitSession(reader);
                        console.log(initSession);
                        
                        break;

                    case 0x19:
                        var split = new Split(reader);
                        console.log(split);
                        
                        break;

                    default:
                        console.log('C: %s unparsed\n' + hexdump(message), header.messageType);
                }
            }
            else
            {
                // control packets?   
            }
        }
        catch (e)
        {
            console.log('exception: ' + e);
            console.log( e.stack );
            console.log('offending packet');
            console.log(hexdump(message));
        }
            
    });
}
util.inherits(FromClientParser, EventEmitter);

module.exports.FromServer = FromServerParser;
module.exports.FromClient = FromClientParser;