
var shipWidth = 64;
var shipPadding = 20;
var ships;

window.onload = function() {
	$.getJSON("data/data.json", function(data) {
		ships = data.ships.sort(function() { return 0.5 - Math.random(); });
        drawShips();
		toggleArrows(true);
		document.getElementById('play-button').addEventListener('click', function () {
            enterGame();
		});
	});
};

window.onresize = function() {
    document.querySelector('#ships ul').innerHTML = '';
    drawShips();
};

function drawShips(){
    var space = 0;
    var counter = 0;
    var iterator = 0;
    var container = document.querySelector('#ships ul');
    var keepGoing=true;
    while (keepGoing) {
        var img = document.createElement('img');
        img.setAttribute('src', ships[iterator][0]);
        img.setAttribute('onclick', 'selectShip(' + counter + ');');
        img.setAttribute('data-selectedSet', ships[iterator][1]);
        var ship = document.createElement('li');
        ship.setAttribute('id', counter);
        ship.appendChild(img);
        container.appendChild(ship);
        var block = shipWidth + shipPadding;
        space += block;
        ship.style.left = ((block) * counter) + 'px';

        if(iterator == Math.floor(ships.length / 2))
        {
            selectedSet = ships[iterator][1];
        }

        counter++;
        iterator++;

        if(counter==ships.length) iterator = 0;
        var mod = counter % ships.length;
        if((space >= container.offsetWidth) && (counter%ships.length === 0))
            keepGoing = false;
    }

}

function toggleArrows(enable) {
	if(enable){
		$('#left-arrow').on('click', function() { arrowClicked('next');	});
		$('#right-arrow').on('click', function() { arrowClicked('prev'); });
	}
	else{
		$('#left-arrow').off('click');
		$('#right-arrow').off('click');
	}
}

function arrowClicked(direction) {
    //console.log(direction);
    if(!window.canUseArrows) return;
    
    var totalWidth = document.getElementById("ships").offsetWidth;
    var parent = document.querySelector('#ships ul');
    var block = shipWidth + shipPadding;
    var opposite;
    var flag;
    //console.log(totalWidth);
    switch (direction) {
        case 'prev':
            for(var index = 0; index < parent.childNodes.length; index++)
            {
                var child = parent.childNodes[index];
                if(child.offsetLeft - block < 0)
                {
                    flag = child;
                }
                else
                {
                    //console.log(child.style.left);
                    child.style.left = block*(index - 1) + "px";
                    //console.log(child.style.left);
                }
            }
            if(flag !== undefined)
            {
                opposite = parent.childNodes[parent.childNodes.length - 1];
                flag.style.left = opposite.offsetLeft + block + "px";
                parent.appendChild(flag);
                flag = undefined;
            }

            break;
        case 'next':
            for(var nextIndex = 0; nextIndex < parent.childNodes.length; nextIndex++)
            {
                var nextChild = parent.childNodes[nextIndex];

                if(nextChild.offsetLeft + block > totalWidth)
                {
                    flag = nextChild;
                }
                else
                {
                    nextChild.style.left = block*(nextIndex + 1) + "px";
                }
            }

            if(flag !== undefined)
            {
                parent.insertBefore(flag, parent.firstChild);
                flag.style.left = "0px";
                flag = undefined;
            }

            break;
    }

    selectedSet = parent.childNodes[Math.floor(ships.length / 2)].firstChild.getAttribute('data-selectedSet');
    resetIndex();

    /*
	var delta = $("#ships ul li img").width() +
				getValueAsInt($("#ships ul li").css('padding-left')) +
				getValueAsInt($("#ships ul li").css('padding-right'));

	var container = $("#ships ul");
	var current = getValueAsInt(container.css('left'));
	toggleArrows(false);
	switch(direction){
		case 'prev':
			container.animate({left:current + delta}, 'fast',function(){toggleArrows(true);});
			break;
		case 'next':
			container.animate({left:current - delta}, 'fast',function(){toggleArrows(true);});
			break;
        default:
            toggleArrows(true);
	}
    */
}

function getValueAsInt(valueInPx) {
	return parseInt(valueInPx.slice(0,-2));
}

function selectShip(index) {
    var parent = document.querySelector('#ships ul');
    var numShips = parent.childNodes.length;
    var middleShip = Math.floor(parent.childNodes.length / 2);

    if(index < middleShip)
    {
        while(index < middleShip)
        {
            arrowClicked('next');
            index++;
        }

        resetIndex();
    }
    else if(index > middleShip)
    {
        while(index > middleShip)
        {
            arrowClicked('prev');
            index--;
        }

        resetIndex();
    }
}

function resetIndex() {
    var shipSelector = document.querySelector('#ships ul');

    for(var index = 0; index < shipSelector.childNodes.length; index++)
    {
        var child = shipSelector.childNodes[index];
        $(child).find("img").attr("onclick", 'selectShip(' + index + ');');
    }
}
