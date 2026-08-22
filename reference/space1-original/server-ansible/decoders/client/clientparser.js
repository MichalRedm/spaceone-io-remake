var hexdump = require('hexdump-nodejs'),
    util   = require('util'),
    Reader = require('../reader'),
    SetTarget = require('./settarget'),
    VariableHeader = require('../variableheader'),
    SendNick = require('./sendnick'),
    Split = require('./split'),
    InitSession = require('./initsession'),
    EventEmitter = require('events').EventEmitter;


var ClientParser = function() {};
ClientParser.prototype.parse = function(message)
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

                case 0x11:
                    return { type:'shoot' };
                    break;

                case 0x21: // ping  
                    return { type:'ping' };
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

module.exports = ClientParser;