var leaderHunterMode = false;

renderers.push(function(ctx, game) {
    if (leaderHunterMode && game.leader)
    {
        // this was deemed unfair by gang at discord
        /*ctx.beginPath();
        ctx.fillStyle = "rgba(0, 255, 0, 0.2)";
        ctx.arc(game.leader.x, game.leader.y, 800, 0, 2*Math.PI);
        ctx.fill();*/

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
    }
});


$(function() {
    var list = $('<li></li>');

    list.append(document.createTextNode('show leaders: '));
    list.append($('<a href="#">off</a> <a href="#">on</a>'));
    $('#ansiblelinks').append(list);
    
    list.find('a').on('click', function(e) {
        leaderHunterMode = ($(this).text() == "on");
        e.preventDefault();
    });
});
