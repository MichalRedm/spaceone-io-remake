var panelPinned = false;
$(function() {
    $('#panel .pin').on('click', function() {
        panelPinned = $('#panel .pin').is(':checked');
        if (panelPinned)
            $('#panel').show();
        else
            $('#panel').hide();
    });

    $(document).on('keydown', function(e) {
        if (e.keyCode == 70 || e.which == 70)
            $('#panel').show();
    });
    $(document).on('keyup', function(e) {
        if ((e.keyCode == 70 || e.which == 70) && !panelPinned)
            $('#panel').hide();
    });
});