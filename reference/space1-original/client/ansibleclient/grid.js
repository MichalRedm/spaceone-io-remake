var drawGrid = false;

renderers.push(function(ctx, game) {
    if (drawGrid)
    {
        var 
            x = Math.floor(myFleet.bcx / 100)*100,
            y = Math.floor(myFleet.bcy / 100)*100;

        ctx.strokeStyle = "rgba(0, 255, 0, 0.5)";
        for(var i=-9; i<11; i++)
        {
            ctx.beginPath();
            var yVal = (y+i*100);
            if (yVal % 1000 == 0)
                ctx.lineWidth = 8;
            else if (yVal % 500 == 0)
                ctx.lineWidth = 4;
            else
                ctx.lineWidth = 2;

            ctx.moveTo(x-6000, yVal);
            ctx.lineTo(x+6000, yVal);
            ctx.stroke();

            ctx.beginPath();
            var xVal = (x+i*100);
            if (xVal % 1000 == 0)
                ctx.lineWidth = 8;
            else if (xVal % 500 == 0)
                ctx.lineWidth = 4;
            else
                ctx.lineWidth = 2;

            ctx.moveTo(xVal, y-6000);
            ctx.lineTo(xVal, y+6000);
            ctx.stroke();
        }
    }
});


$(function() {
    var list = $('<li></li>')
        .addClass('grid');

    list.append(document.createTextNode('grid: '));
    list.append($('<a href="#">off</a> <a href="#">on</a>'));
    $('#ansiblelinks').append(list);
    
    list.find('a').on('click', function(e) {
        drawGrid = ($(this).text() == "on");
        e.preventDefault();
    });
});
