function bootstrapSettings()
{
    $('#graphics-high').on( 'click', function()
    {
        switchGraphics('high');
    });

    $('#graphics-medium').on( 'click', function()
    {
        switchGraphics('medium');
    });

    $('#graphics-low').on( 'click', function()
    {
        switchGraphics('low');
    });
}

function switchGraphics(setting)
{
    switch(setting)
    {
        case 'high':
            $('#graphics-low').removeClass('setting-selected');
            $('#graphics-medium').removeClass('setting-selected');
            $('#graphics-high').addClass('setting-selected');

            break;
        case 'medium':
            $('#graphics-low').removeClass('setting-selected');
            $('#graphics-high').removeClass('setting-selected');
            $('#graphics-medium').addClass('setting-selected');

            break;
        case 'low':
            $('#graphics-high').removeClass('setting-selected');
            $('#graphics-medium').removeClass('setting-selected');
            $('#graphics-low').addClass('setting-selected');

            break;
        default:
            break;
    }

    setGraphics(setting);
}