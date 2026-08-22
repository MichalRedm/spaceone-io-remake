

var isGameServerConnected = false;
var isMaestroConnected;
var scale = window.localStorage.retina ? window.devicePixelRatio : 1.0;
var canvas = document.getElementById('canvas');
var hasSentNick = false;
var canUseArrows = true;
var autofire = false;
var canPressPlay = false;
var intervalId;
var funcionalitiesTogglable = false;
var timeoutValue = 1000 * 60 * 2;
var currentInstruction = 0;
var instructions = ['MOVE MOUSE to steer fleet', 'CLICK or SPACE to shoot', '\'S\' to Split & Dash'];
var isPlaying;
var keysDown = {};
var afkTimeout;
window.IO = window.IO || {};
var selectedSet;
var continentCode;
var countryCode;
var latestValue = 0;
var arenaLink;
var sentArenaLink;
var linkFromURL;
var forcedDisconnect;
var maestroDNS = [".space1.io", "-722654420.eu-central-1.elb.amazonaws.com", "-1920190237.us-east-1.elb.amazonaws.com", "-1528271590.us-west-1.elb.amazonaws.com"];
var maestroPorts = [":8081", ":8080"];
var webSocketType = ["wss://", "ws://"];
var currentMaestroDNS;
var currentMaestroVersion = "flocks-maestro-live-v1-3";
var currentWebSocket;
var currentMaestroPort;
var preventDefault = function() { event.preventDefault(); }

window.IO.RightMouseClickEnabled = function(enabled) {
    if (enabled) {
        document.removeEventListener('contextmenu', preventDefault);
    } else {
        document.addEventListener('contextmenu', preventDefault);
    }
}

window.addEventListener("resize", onResize); 
window.onmousemove = function(e) { if(window.core) core.setTarget(e.clientX * scale, e.clientY * scale); };
window.onmousedown = function(e) {
	if(window.core) core.setTarget(e.clientX * scale, e.clientY * scale);

	if(e.button === 0 && window.core) {
		core.shoot();
		clearInterval(intervalId);
		intervalId = setInterval(core.shoot, 1);
	}
};
window.onmouseup = function(e) {
	if(window.core) core.setTarget(e.clientX * scale, e.clientY * scale);
	if(e.button === 0 && window.core) { clearInterval(intervalId); }
};

window.onkeydown = function(e) {
	if(keysDown[e.keyCode]) return;
	keysDown[e.keyCode] = true;

	if(e.keyCode == 77)
	{
		if(window.core)
		{
			core.pixiRender();
		}
	}
	else if(e.keyCode == 83) { if(window.core) { core.splitAndDash(); } }
	else if(e.keyCode == 32)
	{
		if(!$("#nameInput").is(":focus")) e.preventDefault();

		if(window.core)
		{
			clearInterval(intervalId);
			intervalId = setInterval(core.shoot, 1);
		}
	}
	else if(e.keyCode == 69)
	{
		if(window.core && funcionalitiesTogglable && hasSentNick)
		{
			autofire = !autofire;
			core.toggleAutofire(autofire);
		}
	}
	else if(e.keyCode == 81)
	{
	}
	else if(e.keyCode == 73)
	{
	}
	else if(e.keyCode == 13)
	{
        if (!window.popupShowing)
        {
            enterGame();
        }
	}
	else if(e.keyCode == 68) { if(window.core && funcionalitiesTogglable) core.debug(); }
	else if(e.keyCode == 70) { if(window.core && funcionalitiesTogglable) core.debugAssets(); }
	else if(e.keyCode == 37) { arrowClicked('next'); }
	else if(e.keyCode == 39) { arrowClicked('prev'); }
};

window.onkeyup = function(e) {
	keysDown[e.keyCode] = false;
	if(e.keyCode == 32){ if(window.core) { clearInterval(intervalId); } }
};

window.IO.onDisconnect = function(forced, wasError, isReconnection) {
	window.isGameServerConnected = false;
	window.forcedDisconnect = forced;

	if(forced) { window.isMaestroConnected = false; }

	refreshAds();

	goToMainMenu(wasError, isReconnection);
};

window.IO.onPlayerDeath = function() {
	refreshAds();
	setTimeout(function() { window.IO.HandleOnPlayerDeath(); }, 1000);
};

window.IO.HandleOnPlayerDeath = function() {
	goToMainMenu(false, false);

	if(window.core) { MCSDK.analytics.sendEvent('match', {match_duration : core.getMatchDuration(), top_position : core.getTopPosition(), final_position : core.getFinalPosition()}); }

	if(window.core)
	{
		if(core.isArenaClosing())
		{
			console.info('Since arena is closing, we disconnect this player');
			core.disconnect();
		}
	}

	afkTimeout = setTimeout(function() { if(window.core && !window.isPlaying) core.disconnect(); }, window.timeoutValue);
};

window.IO.onFlocksCoreLoaded = function() {
	autofire = false;
	afkTimeout = setTimeout(function()
	{
		if(window.core && !window.isPlaying) core.disconnect();
	}, window.timeoutValue);

    checkCookie();
	setInputNameFromCookie();
	onResize();
	bootstrapPopups();
	bootstrapSettings();
	showBanner();

	var regionIndex = getRegionIndexFromArenaLink(getLinkFromURL());
	if(regionIndex !== undefined)
	{
		window.currentMaestroDNS = window.maestroDNS[regionIndex];
		window.currentWebSocket = window.webSocketType[1];
		window.currentMaestroPort = window.maestroPorts[1];
	}

	findServer(true);
	fadeInMainMenu(1500);
	setInterval( function() { changeInstructionText(); }, 4000);
	changeInstructionText();
};

window.IO.gameServerConnected = function()
{
	console.log("Connected to game server!");
	window.isGameServerConnected = true;
	window.IO.sendNick();
};

window.IO.maestroConnected = function()
{
	window.isMaestroConnected = true;
	window.sentArenaLink = undefined;
	if(window.forcedDisconnect) { enterGame(); }
};

window.IO.sendNick = function() 
{
	if (!isGameServerConnected) return;
	
	if (isCookieShowing) {
		$('#cookie').animate({
			top: "-=250"
  		}, 1000, function() {
   			$('#cookie').remove();
		});
	}

	if(!hasSentNick)
	{
		clearTimeout(afkTimeout);

		if(window.core)
		{
			core.setFadeout(false);
			setCookie("nickname", $('#nameInput').val(), 365);
			$("body").removeClass('static_background');
			core.sendNick($('#nameInput').val(), selectedSet);

			if(window.countryCode === undefined)
			{
				MCSDK.analytics.sendInitEvent({login_type : "guest", game_version : String(window.latestValue)});
			}
			else
			{
				MCSDK.analytics.sendInitEvent({ login_type: "guest", country : window.countryCode,  game_version : String(window.latestValue)});
			}
			
			window.isPlaying = true;
		}
		funcionalitiesTogglable = true;
	}
};

window.IO.hasSentNick = function() { hasSentNick = true; };

window.IO.setHighScore = function(score) {
	checkCookie();
	if (score > highScore) {
  		$('#high-score span').text(score);
		setCookie("highscore", score, 365);
	}
};

window.IO.setContinentCode = function(code) {
	window.continentCode = code;
	tryToShowCookie();
};

window.IO.setCountryCode = function(code) {
	console.log('Country Code: ' + code);
	window.countryCode = code;
};

window.IO.setAWSRegionCode = function(code) {
	setAWSRegionCode(code);
	bootstrapArenaLink();
};

window.IO.showArenaFullNotification = function()
{
	fadeInMainMenu(1500);
	$('#canvas').hide();

	showToastr(getToastrHTML('The arena link is full. Retry connecting or join other arena by pressing \'PLAY\'!', true), true, 'toast-custom-position');

	$('#retry-button-toastr').on( 'click', function()
	{
		window.sentArenaLink = undefined;
		enterGame();
	});
};

window.IO.randomFromRange = function (min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
};

function findServer(isFirstConnection) {
	var env = 'LIVE';

	if(window.core)
	{
		
		if(window.currentMaestroDNS === undefined)
		{
			window.currentMaestroDNS = window.maestroDNS[0];
			window.currentWebSocket = window.webSocketType[0];
			window.currentMaestroPort = window.maestroPorts[0];
		}

		if(isFirstConnection)
		{
			connectToMaestro(env, false);
		}
		else
		{
			connectToMaestro(env, true);
		}
	}
}

function isAbleToUseArrows(useArrows) {	window.canUseArrows = useArrows; }

function connectToMaestro(env, isReconnect)
{
	var localQueryString = "ws://localhost:9500/ws";
	var stagQueryString = window.currentWebSocket + 'flocks-maestro-stag.space1.io' + window.currentMaestroPort + '/ws';
	var devQueryString = window.currentWebSocket + 'flocks-maestro-dev.space1.io' + window.currentMaestroPort + '/ws';
	var liveQueryString = window.currentWebSocket + window.currentMaestroVersion + window.currentMaestroDNS + window.currentMaestroPort + '/ws';

	console.log('Will connect to: ' + env);

	switch(env)
	{
		case 'local':
			isReconnect ? core.reconnect(localQueryString) : core.connectToMaestro(localQueryString);
			break;
		case 'dev':
			isReconnect ? core.reconnect(devQueryString) : core.connectToMaestro(devQueryString);
			break;
		case 'stag':
			isReconnect ? core.reconnect(stagQueryString) : core.connectToMaestro(stagQueryString);
			break;
		case 'LIVE':
			isReconnect ? core.reconnect(liveQueryString) : core.connectToMaestro(liveQueryString);
			break;
		default:
			break;
	}
}

function fadeInMainMenu(milliseconds)
{
	$('.visibility').fadeIn(milliseconds);
	setTimeout(function() {	window.canPressPlay = true; }, milliseconds);
}

function fadeOutMainMenu(milliseconds)
{
	$('.visibility').fadeOut(milliseconds);
	window.canPressPlay = false;
}

function refreshAds()
{
	MCSDK.ads.refreshSlot('advertisement300x250');
	MCSDK.ads.refreshSlot('advertisement728x90');
}

function enterGame() {
	if (window.hasSentNick || !window.canPressPlay) return;

	if(!window.isMaestroConnected)
	{
		findServer();
		return;
	}

	if(window.core)
	{
		//First we check if URL already has a link
		window.linkFromURL = getLinkFromURL();

		//linkFromURL is != undefined if we already have a link in the URL
		if(window.linkFromURL !== undefined)
		{
			//We set arenaLink as the one in the URL
			window.arenaLink = window.linkFromURL;
			console.log('There was already an ARENA LINK in the URL, so we will use this one to connect instead: ' + window.arenaLink);
		}
		else
		{
			//If there is no link in the URL, we try to get the one generated by the user
			var generatedLink = getGeneratedArenaLink();
			if(generatedLink !== undefined)
			{
				//If the user actually generated one, we set arenaLink to it
				window.arenaLink = generatedLink.substring(1, generatedLink.length);
				console.log('User Generated a URL for ARENA LINK: ' + window.arenaLink);
			}
			else
			{
				//User didn't generate a URL
				console.log('There is no link in URL, or generated link');
			}
		}

		if(window.arenaLink === undefined)
		{
			//If at this stage arenaLink is undefined, that means there is no link in URL and the user didn't generate any
			console.log('Arena link is undefined, (there was no link in URL, and user didn\'t generate one) so we send an empty enter game request');
			core.sendEnterGameRequest("", false);
		}
		else
		{
			if(window.sentArenaLink == window.arenaLink)
			{
				//In here, user has already sent this link previously, so no need to send it again
				console.info('We have already sent this arena link, so it\'s just a regular play button press');
				core.sendEnterGameRequest("", false);
			}
			else
			{
				//An actual new link to send, we send it and save in sentLink so that we don't send it again
				core.sendEnterGameRequest(window.arenaLink, true);
				window.sentArenaLink = window.arenaLink;
				console.info('Sending Enter Game Request for this [NEW] ARENA LINK: ' + window.arenaLink);
			}
		}
	}

	//We send an enterGameRequest, we want to start showing canvas here for the connecting text
	$('.visibility').hide();
	$('#canvas').show();
	if($('.toast-custom-position') !== undefined)
	{
		$('.toast-custom-position').remove();
		console.log('Removing toast');
	}
	else
	{
		console.error('Error 404: Toast not found');
	}
}

function reloadCore() {
	if(!window.core) return;

	core.destroy();
	var imported = document.createElement('script');
	imported.src = 'flocksio.core.js';
	document.head.appendChild(imported);
}

function onResize() {
	canvas.width = window.innerWidth * scale;
	canvas.height = window.innerHeight * scale;
	showBanner();
}

function goToMainMenu(wasError, isReconnection){
	window.canPressPlay = false;

	resetArenaLink();
	showBanner();

	if(!isReconnection) { fadeInMainMenu(1500); }
	if(wasError) { showToastr('Couldn\'t connect to an arena. Please try again', false, 'toast-bottom-left'); }

	setInputNameFromCookie();
    
    window.IO.RightMouseClickEnabled(true);
	
	window.hasSentNick = false;
	funcionalitiesTogglable = false;
	window.isPlaying = false;
}

function showToastr(message, hasClose, position)
{
	if(hasClose)
	{
		toastr.options.timeOut = -1;
		toastr.options.extendedTimeOut = -1;
		toastr.options.hideDuration = 0;
	}
	else
	{
		toastr.options.timeOut = 30;
	}

	toastr.options.onClick = 'null';
	toastr.options.positionClass = position;
	toastr.options.closeButton = hasClose;
	toastr.error(message);
}

function getToastrHTML(message, retry)
{
	var html =  '<div>' + message + '</div>';

	if(retry) {	html += '<div><button type="button" id="retry-button-toastr" class="toastr-button">Retry</button></div>'; }

	return html;
}

function changeInstructionText()
{
	$('#instructions-text').fadeOut(1000, function(){
		var p = $('#instructions-text');
		p.text(window.instructions[window.currentInstruction]);
	});

	$('#instructions-text').fadeIn(1000);

	if(window.currentInstruction == window.instructions.length - 1)
	{
		window.currentInstruction = 0;
	}
	else
	{
		window.currentInstruction++;
	}
}

function setGraphics(graphicSettings)
{
	if(!window.core) return false;
	core.setGraphics(graphicSettings);
    setCookie("graphics", graphicSettings, 365);
	return true;
}

function showBanner()
{
	if(window.innerHeight > 810 && window.innerWidth > 1400)
	{
		$('#advertisement728x90').css('display', 'block');
		$('#advertisement300x250').css('padding-bottom', '70px');
	}
	else
	{
		$('#advertisement728x90').css('display', 'none');
		$('#advertisement300x250').css('padding-bottom', '0');
	}
}
