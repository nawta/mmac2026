(function () {
  'use strict';

  // Fullscreen, from the f key or from any button marked for it. The click
  // handler is delegated rather than bound to one element, because site.js
  // builds its button at DOM-ready and the page may also carry one of its own;
  // delegation means neither file has to load before the other.

  var SELECTOR = '#deck-fullscreen, [data-deck-action="fullscreen"]';

  function element() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function toggle() {
    if (element()) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return;
    }
    var root = document.documentElement;
    var request = root.requestFullscreen || root.webkitRequestFullscreen || root.mozRequestFullScreen;
    if (request) request.call(root);
  }

  function isTyping(target) {
    if (!target) return false;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  // Escape and the browser's own control leave fullscreen without going through
  // toggle(), so the label follows the document rather than the last click.
  // Whatever the button says in the markup is kept as its resting label, so a
  // page that writes its own wording or ships an icon-only button keeps it.
  function syncLabels() {
    var open = !!element();
    var buttons = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      button.setAttribute('aria-pressed', String(open));
      if (button.getAttribute('data-label-rest') === null) {
        button.setAttribute('data-label-rest', button.textContent.trim());
      }
      var rest = button.getAttribute('data-label-rest');
      if (!rest || button.querySelector('svg, img')) continue;
      button.textContent = open ? (button.getAttribute('data-label-open') || 'Exit full screen') : rest;
    }
    document.body.classList.toggle('is-fullscreen', open);
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest(SELECTOR);
    if (!button) return;
    toggle();
    // Otherwise Space and Enter would press the button again instead of
    // advancing the deck.
    button.blur();
  });

  window.addEventListener('keydown', function (event) {
    if (event.defaultPrevented || isTyping(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key !== 'f' && event.key !== 'F') return;
    toggle();
    event.preventDefault();
  });

  document.addEventListener('fullscreenchange', syncLabels);
  document.addEventListener('webkitfullscreenchange', syncLabels);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncLabels, { once: true });
  } else {
    syncLabels();
  }

  window.DeckFullscreen = { toggle: toggle, isOpen: function () { return !!element(); } };
})();
