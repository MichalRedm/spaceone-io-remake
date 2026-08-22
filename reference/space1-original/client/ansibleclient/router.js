var myFleet = false;

var renderers=[];
var processors=[];

window.render = function(ctx, game)
{
    if (!game.fleets || !ctx) return;

    for(var i=0; i<renderers.length; i++)
    {
        try
        {
            renderers[i].apply(this, [ctx, game]);
        }
        catch (e)
        {
            console.log('exception in render');
            console.log(e);
        }
    }
};

window.processGame = function(game)
{
    myFleet = false;
    if (game.fleets)
    {
        for(var i=0;i<game.fleets.length && !myFleet; i++)
            if (game.fleets[i].isMyFleet)
                myFleet = game.fleets[i]

        for(var i=0; i<processors.length; i++)
        {
            try
            {
                processors[i].apply(this, [game, myFleet]);
            }
            catch (e)
            {
                console.log('exception in processor');
                console.log(e);
            }
        }
                            
    }
}

