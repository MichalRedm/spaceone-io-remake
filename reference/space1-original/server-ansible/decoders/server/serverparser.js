var hexdump = require('hexdump-nodejs'),
    util   = require('util'),
    Reader = require('../reader'),
    WorldUpdate = require('./worldupdate'),
    Borders = require('./borders'),
    Leaderboard = require('./leaderboard'),
    VariableHeader = require('../variableheader'),
    YouKilled = require('./youkilled'),
    CellAdded = require('./celladded'),
    EventEmitter = require('events').EventEmitter;

var ServerParser = function() {}
util.inherits(ServerParser, EventEmitter);

ServerParser.prototype.parse = function(message, skipBytes)
{
    try 
    {
        var reader = new Reader(message);
        if (skipBytes)
            reader.seek(skipBytes);
    
        var header = new VariableHeader(reader);
        //console.log("server");
        //console.log(hexdump(message));

        switch (header.messageType)
        {
            case 0x10: // World Update
                var worldUpdate = new WorldUpdate(reader);
                return worldUpdate;
                break;

            case 0x20: // pong
                return false;
                break;

            case 0x14: // ClearMyCells
                return false;
                break;

            case 0x31: // Leaderboard
                var leaderboard = new Leaderboard(reader);
                //console.log(leaderboard);
                return leaderboard;
                break;

            case 0x50: // YouKilled
                var youKilled = new YouKilled(reader);
                //console.log(youKilled);
                return youKilled;
                break;

            case 0x60: 
            case 0x11: 
            case 0x12: 
            case 0x21: 
                // occasional message with payload = 0
                // one of the cache clears?
                return false;
                break;

            case 0x51: // cell added
                var cellAdded = new CellAdded(reader);
                //console.log(cellAdded);
                return cellAdded;
                break;

            case 0x40: // borders
                var borders = new Borders(reader);
                //console.log(borders);
                return borders;
                break;

            default:
                //console.log(header);
                //console.log('S: %s unparsed\n' + hexdump(message), header.messageType);
                return false;
        }
    }
    catch (e)
    {
        console.log('exception: ' + e);
        console.log( e.stack );
        console.log('offending packet');
        console.log(hexdump(message));
        return false;
    }    
}

var FromClientParser = function() {};
FromClientParser.prototype.ParseMessage = function(message)
{
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
                    return setTarget;
                    break;

                case 0x11:  // zero byte messages... one is ping.. other ?
                case 0x21:  
                    return false;
                    break;

                case 0x31: // geo request?
                    // 6 byte payload sent on connection
                    // gets GEO IP estimation response
                    return false;
                    break;

                case 0xFD:
                    var sendNick = new SendNick(reader);
                    console.log(sendNick);
                    return sendNick;
                    break;

                case 0xFE:
                    var initSession = new InitSession(reader);
                    console.log(initSession);
                    return initSession;
                    
                    break;

                case 0x19:
                    var split = new Split(reader);
                    console.log(split);
                    
                    return split;
                    break;

                default:
                    console.log('C: %s unparsed\n' + hexdump(message), header.messageType);
                    return false;
            }
        }
        else
        {
            // control packets?   
            return false;
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

module.exports = ServerParser;