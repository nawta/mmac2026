(function () {
  'use strict';

  // A paper figure sized to sit beside its text is evidence you can point at;
  // the same figure filling the screen is one you can read. A deck printed to
  // PDF has to choose, but a deck being presented does not: click the figure
  // and it opens over the slide at the size of the window, Escape puts it back.

  var SELECTOR = '.fig, figure[data-lightbox]';
  var open = null;

  // Defaults are injected as the first stylesheet in <head> so that anything
  // deck.css or site.css says about .deck-lightbox wins over them. Without
  // this the overlay would depend on CSS written in a file this runtime does
  // not own, and would fail silently if that file never grew a rule for it.
  function injectDefaults() {
    if (document.getElementById('deck-lightbox-defaults')) return;
    var style = document.createElement('style');
    style.id = 'deck-lightbox-defaults';
    style.textContent = [
      '.deck-lightbox{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;',
      'justify-content:center;padding:2.5vmin;box-sizing:border-box;cursor:zoom-out;',
      'background:rgba(20,18,16,.86);}',
      '.deck-lightbox img{max-width:100%;max-height:100%;object-fit:contain;',
      'background:#fff;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.35);}',
      '.deck-lightbox__close{position:absolute;top:2vmin;right:2vmin;font:inherit;',
      'font-size:14px;line-height:1;padding:8px 12px;border-radius:6px;border:0;',
      'color:#333;background:#fff;cursor:pointer;}',
      '.deck-lightbox__cap{position:absolute;left:0;right:0;bottom:1.4vmin;margin:0;',
      'text-align:center;font-size:14px;color:#fff;opacity:.85;padding:0 4vmin;}'
    ].join('');
    var head = document.head || document.documentElement;
    head.insertBefore(style, head.firstChild);
  }

  function close() {
    if (!open) return;
    open.parentNode.removeChild(open);
    open = null;
    document.body.classList.remove('is-lightbox-open');
  }

  function openFor(figure) {
    var source = figure.querySelector('img');
    if (!source) return;
    close();

    var box = document.createElement('div');
    box.className = 'deck-lightbox';
    // The overflow audit measures what fits inside the 16:9 frame. An overlay
    // drawn over the whole window is not part of that and would be reported as
    // a slide that spills.
    box.setAttribute('data-overflow-ignore', '');

    var image = document.createElement('img');
    image.src = source.currentSrc || source.src;
    image.alt = source.alt || '';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'deck-lightbox__close';
    button.textContent = 'Close (Esc)';

    box.appendChild(image);
    box.appendChild(button);

    var caption = figure.querySelector('.fig__cap, figcaption');
    if (caption) {
      var text = document.createElement('p');
      text.className = 'deck-lightbox__cap';
      text.textContent = caption.textContent.trim();
      box.appendChild(text);
    }

    // Appended to <body>, not to the slide: the slide is scaled down to fit the
    // window, and a figure opened inside it would be scaled down with it, which
    // is the one thing this is for undoing.
    document.body.appendChild(box);
    box.addEventListener('click', close);
    open = box;
    document.body.classList.add('is-lightbox-open');
  }

  function bind(figure) {
    if (figure.hasAttribute('data-no-lightbox')) return;
    if (!figure.querySelector('img')) return;
    if (figure.hasAttribute('data-lightbox-bound')) return;
    figure.setAttribute('data-lightbox-bound', '');
    // Set here rather than in a stylesheet so the affordance cannot get out of
    // step with which figures actually open.
    var img = figure.querySelector('img');
    img.style.cursor = 'zoom-in';
    figure.addEventListener('click', function (event) {
      // A caption may carry a link to the source; let it be a link.
      if (event.target.closest && event.target.closest('a')) return;
      openFor(figure);
    });
  }

  function start() {
    injectDefaults();
    var figures = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < figures.length; i++) bind(figures[i]);

    // Capture phase, and the deck's own navigation keys are swallowed: with a
    // figure open, the first press should put it away rather than also moving
    // the deck on behind it.
    document.addEventListener('keydown', function (event) {
      if (!open) return;
      if (event.key === 'Escape' || event.key === ' ' || event.key === 'ArrowRight' ||
          event.key === 'ArrowLeft' || event.key === 'PageDown' || event.key === 'PageUp') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }, true);

    function watch() { window.Deck.on('change', close); }
    if (window.Deck) watch();
    else document.addEventListener('deck:ready', watch, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.DeckLightbox = { open: openFor, close: close, bind: bind };
})();
