var
    Reader = require('./reader');

var LeaderBoard = function(reader)
{
    this.type = 'leaderboard';
    this.ranks = [];
    var count = reader.nextUInt32();
    for(var i = 0; i < count; ++i){
        this.ranks.push({
            isMe: reader.nextUInt8(),
            name: reader.nextUTF8String(),
            score: reader.nextUInt32(),
            color: {r:reader.nextUInt8(), g:reader.nextUInt8(), b:reader.nextUInt8()}
        });
    }
    this.arena = {
        name: reader.nextUTF8String(),
        score: reader.nextUInt32()
    };
}

module.exports = LeaderBoard;