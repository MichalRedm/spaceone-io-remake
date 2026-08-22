
var isCookieShowing = false;
var highScore = 0;
var graphics = 'high';

function setInputNameFromCookie()
{
	var nickname = getCookie("nickname");

	if(nickname !== undefined)
	{
		$('#nameInput').val(getCookie("nickname"));
	}
}

function checkCookie() {
    highScore = getCookie("highscore");
    graphics = getCookie("graphics");
    switchGraphics(graphics);
    if (highScore !== '') {
		$('#high-score span').text(getCookie("highscore"));
    } else {
        $('#high-score span').text(0);
    }
}

function getCookie(cname) {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for(var i = 0; i <ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) === 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

function setCookie(cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    var expires = "expires="+ d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

function tryToShowCookie()
{
	var cookie = getCookie("acceptedCookies");
	if (cookie != 1)
	{

		if(continentCode === 'EU')
		{
			//console.info('EU user, show cookie');
			$('#cookie').css('display', 'block');
			isCookieShowing = true;
		}
		else
		{
			//console.info('User not from EU, don\'t show cookie');
			$('#cookie').css('display', 'hidden');
			isCookieShowing = false;
		}
	}
	else
	{
		$('#cookie').remove();
	}

	checkCookie();

	$('#cookie_ok').on('click', function()
	{
		$('#cookie').animate(
			{
				top: "-=250"
			}, 1000, function()
			{
				$('#cookie').remove();
					setCookie("acceptedCookies", 1, 365);
			});
  	});
}