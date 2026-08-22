
renderers.push(function(ctx, game) {
    ctx.font = "30px Arial";
    for(var i=0; i<game.fleets.length; i++)
    {
        var fleet = game.fleets[i];
        if (fleet.isMyFleet)
            continue;

        if (fleet.leaderboardPosition <= 10)
        {
            ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            ctx.fillText(`#${fleet.leaderboardPosition} - ${fleet.score}`, fleet.bcx + 50, fleet.bcy + 50);
        }
    }
});
