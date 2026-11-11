// Optional enhancement of the landing (ticket #382): a "Copy command" button for the install line.
// Without JavaScript the button stays `hidden` and the command remains selectable text.
(function () {
  var button = document.getElementById('copy-btn');
  var status = document.getElementById('copy-status');
  var source = button && document.getElementById(button.getAttribute('data-target'));
  if (!button || !status || !source || !navigator.clipboard) return;
  button.hidden = false;
  button.addEventListener('click', function () {
    navigator.clipboard.writeText(source.textContent.trim()).then(
      function () {
        status.textContent = 'Copied';
      },
      function () {
        status.textContent = 'Copy failed: select the command and copy it manually.';
      },
    );
  });
})();
