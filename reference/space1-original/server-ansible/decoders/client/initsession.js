var
    Reader = require('./reader');

var InitSession = function(reader)
{
    this.type = 'initsession';
}

module.exports = InitSession;
