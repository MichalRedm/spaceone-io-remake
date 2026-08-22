
//For arena link
var generatedLink;
var alphabet = "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"; //alphabet for arena link, we can add more letters if needed
var regions = ["", "eu-central-1", "us-east-1", "us-west-1"];
var base = alphabet.length; // base is the length of the alphabet (58 in this case)
var awsRegionCode;
var textInputClicked = false;
var copyButtonClicked = false;

function setAWSRegionCode(code)
{
    window.awsRegionCode = code;
}

function getGeneratedArenaLink()
{
	if(window.copyButtonClicked || window.textInputClicked)
	{
		return window.generatedLink;
	}
	else
	{
		return undefined;
	}
}

//------------------- LINK DECODING FUNCTIONS ---------------------
function getLinkFromURL()
{
	var linkInURL;
	var actualWindow;
	//console.log('Running inside iframe!');

	if(iframeDetection())
	{
		console.log('Window is Iframed');
		actualWindow = parent.window;
	}
	else
	{
		console.log('No IFrame detected');
		actualWindow = window;
	}

	if(actualWindow.location.hash.length > 0)
	{
		console.log('Reading arena Link from URL');
		linkInURL = readArenaLinkFromURL(actualWindow.location.hash);

		console.log('Arena Link from URL: ' + linkInURL);
	}

	return linkInURL;
}

function readArenaLinkFromURL(hashUrl)
{
	var arenaLink = hashUrl.substring(1, hashUrl.length);

	if(linkSemanticallyCorrect(arenaLink))
	{
		//Send arena link to maestro
		console.log("Link checks out!");
		return arenaLink;
	}
	else
	{
		console.log("This link doesn't check out!");
		return undefined;
	}
}

function linkSemanticallyCorrect(arenaLink)
{
	var encodedRegionIndex = arenaLink.substring(arenaLink.length - 1,  arenaLink.length);
	//console.log('Encoded Region Index: ' + encodedRegionIndex);
	var encodedTimeStamp = arenaLink.substring(0, arenaLink.length - 1);
	//console.log('Encoded TimeStamp: ' + encodedTimeStamp);

	var decodedRegionIndex = decodeArenaLink(encodedRegionIndex);
	//console.log('Decoded Region Index: ' + decodedRegionIndex);
	if(decodedRegionIndex < regions.length)
	{
		//console.log('From link I got region: ' + regions[decodedRegionIndex]);

		var decodedTimeStamp = decodeArenaLink(encodedTimeStamp);
		//console.log('From link I got timestamp: ' + decodedTimeStamp);

		if(decodedTimeStamp.toString().length == 13)
		{
			return true;
		}
	}

	return false;
}

function getRegionIndexFromArenaLink(arenaLink)
{
	if(arenaLink === undefined) return undefined;
	
	var encodedRegionIndex = arenaLink.substring(arenaLink.length - 1,  arenaLink.length);
	var decodedRegionIndex = decodeArenaLink(encodedRegionIndex);

	if(decodedRegionIndex < regions.length)
	{
		return decodedRegionIndex;
	}

	return undefined;
}

//------------------- ARENA LINK POPUP MANAGEMENT FUNCTIONS ---------------------

function resetArenaLink(state)
{
	var arenaLinkDiv = $('#arena-link');
	var arenaLinkSpan = $('#arena-link-span');
	var arenaLinkInput = $('#arena-link-input');
	var arenaLinkClose = $('#arena-link-close');
	var arenaLinkSuccess = $('#arena-link-success');
	var arenaLinkButton = $('#generate-link-button');

	switch (state)
	{
		case 'copied':
		arenaLinkDiv.attr('data-state', 'open');
		arenaLinkSpan.html('Play with your friends!<br/>Share this link:');
		arenaLinkButton.html('COPY LINK');
		arenaLinkButton.show();

		//Should generate link here
		if(window.generatedLink === undefined)
		{
			window.generatedLink = createArenaLink();
		}
		//console.log('After set value: ' + window.generatedLink);
		arenaLinkInput.val('http://spaceone.io/' + window.generatedLink);
		arenaLinkSuccess.hide();
		arenaLinkClose.hide();
		arenaLinkInput.show();
			break;
		case 'open':
		arenaLinkDiv.attr('data-state', 'closed');

		arenaLinkSpan.html('Play with your friends!');

		arenaLinkInput.hide();

		arenaLinkClose.hide();

		arenaLinkSuccess.hide();

		arenaLinkButton.html('ARENA LINK');
		arenaLinkButton.show();
			break;
		default:
		arenaLinkDiv.attr('data-state', 'open');
		arenaLinkSpan.html('Play with your friends!<br/>Share this link:');
		arenaLinkButton.show();
		arenaLinkSuccess.hide();
		arenaLinkClose.hide();
		arenaLinkInput.show();
			break;
	}
}

function bootstrapArenaLink()
{
	//Should generate link here
	if(window.generatedLink === undefined)
	{
		window.generatedLink = createArenaLink();
	}

	var arenaLinkInput = $('#arena-link-input');
	arenaLinkInput.val('http://spaceone.io/' + window.generatedLink);

	$('#generate-link-button').on( 'click', function()
	{
		handleArenaLinkState($('#arena-link').attr('data-state'));
	});

	$('#arena-link-close').on( 'click', function()
	{
		resetArenaLink($('#arena-link').attr('data-state'));
	});

	$('#arena-link-input').on( 'click', function()
	{
		window.textInputClicked = true;
	});
}

function handleArenaLinkState(state)
{
	var arenaLinkDiv = $('#arena-link');
	var arenaLinkButton = $('#generate-link-button');
	var arenaLinkInput = $('#arena-link-input');
	var arenaLinkSpan = $('#arena-link-span');
	var arenaLinkSuccess = $('#arena-link-success');
	var arenaLinkClose = $('#arena-link-close');

	window.copyButtonClicked = true;

	switch (state)
		{
			case 'closed':
				arenaLinkSpan.html('Share this link with<br /> your friends!');
				arenaLinkButton.html('COPY LINK');

				//Should generate link here
				if(window.generatedLink === undefined)
				{
					window.generatedLink = createArenaLink();
				}
				//console.log('After set value: ' + window.generatedLink);
				arenaLinkInput.show();

				arenaLinkClose.show();

				arenaLinkDiv.attr('data-state', 'open');
				break;

			case 'open':
				var copyInput = document.querySelector('#arena-link-input');
				copyInput.select();

				//Try to copy input
				try
				{
					var successful = document.execCommand('copy');
					var msg = successful ? 'successful' : 'unsuccessful';
					console.log('Copying text command was ' + msg);

					if(msg === 'successful')
					{
						arenaLinkInput.hide();
						arenaLinkButton.hide();
						arenaLinkSpan.html('LINK COPIED!<br /> ');
						arenaLinkSuccess.show();
						arenaLinkClose.show();

						arenaLinkDiv.attr('data-state', 'copied');
					}
				}
				catch (err)
				{
					console.log('Oops, unable to copy');
				}
				break;

			case 'copied':
				break;

			default:
				break;
		}
}


//------------------- LINK GENERATION FUNCTIONS ---------------------
function createArenaLink()
{
	var arenaLink;
	var actualWindow;

	if(iframeDetection())
	{
		console.log('Window is Iframed');
		actualWindow = parent.window;
	}
	else
	{
		console.log('No IFrame detected');
		actualWindow = window;
	}

	if(actualWindow.location.hash.length > 0)
	{
		console.log('Reading arena Link from URL');
		arenaLink = readArenaLinkFromURL(actualWindow.location.hash);

		console.log('Arena Link: ' + arenaLink);

		if(arenaLink !== undefined) return '#' + arenaLink;
	}

	function regionCodeIndex(regionCode)
	{
		console.log('Logging Region Code: ' + regionCode);
		for(var i = 0; i < regions.length; i++)
		{
			if(regionCode === regions[i])
			{
				console.log('Region found, index is: ' + i);
				return i;
			}	
		}
	}

	var dt = Date.now();
	//console.log('------------> ' + dt);
	var encodedArenaLink = encodeArenaLink(dt);
	var encodedRegionCode = encodeArenaLink(regionCodeIndex(window.awsRegionCode));

	console.log('Encoded region code: ' + encodedRegionCode);

	 arenaLink = '#' + encodedArenaLink + encodedRegionCode;

	return arenaLink;
}


//------------------- UTILITY FUNCTIONS ---------------------
// utility function to convert base 10 integer to base 58 string
function encodeArenaLink(num)
{
	var encoded = '';
	while (num)
	{
		var remainder = num % base;
		num = Math.floor(num / base);
		encoded = alphabet[remainder].toString() + encoded;
	}
	return encoded;
}

// utility function to convert a base 58 string to base 10 integer
function decodeArenaLink(str)
{
  var decoded = 0;
  while (str){
    var index = alphabet.indexOf(str[0]);
    var power = str.length - 1;
    decoded += index * (Math.pow(base, power));
    str = str.substring(1);
  }
  return decoded;
}

function iframeDetection()
{
	return window.self !== window.top;
}
