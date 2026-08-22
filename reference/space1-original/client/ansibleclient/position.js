processors.push(function(game, myFleet) {
    //console.log({x: myFleet.bcx, y: myFleet.bcy });
});

$(function() {
    var positionDisplay = $('<li></li>');
    $('#ansiblelinks').append(positionDisplay);

    setInterval(function() {
        if (myFleet)
            positionDisplay.text(`position: x:${myFleet.bcx}, y:${myFleet.bcy}`);
        else 
            positionDisplay.text(`position: n/a`);
    }, 200);
});
