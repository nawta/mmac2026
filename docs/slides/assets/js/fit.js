(function () {
  'use strict';

  // The deck is authored at a fixed 16:9 size so that a font size chosen once
  // means the same thing on every slide. This scales that fixed stage down to
  // whatever window it is being shown in, with a CSS transform: layout stays at
  // the design size, so nothing reflows between a laptop and a projector and a
  // chart never has to be redrawn for a new width.

  var DESIGN_W = 1920;
  var DESIGN_H = 1080;

  var stage = null;      // the element that gets the transform, if there is one
  var slides = [];
  var deckEl = null;

  function tokenSize(name, fallback) {
    var raw = '';
    try {
      raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    } catch (error) {
      raw = '';
    }
    var value = parseFloat(raw);
    return value > 0 ? value : fallback;
  }

  function designWidth(el) {
    // The element's own layout width is the truth when there is one; the tokens
    // are the fallback for the moment before the stylesheet has applied.
    return el && el.offsetWidth > 0 ? el.offsetWidth : tokenSize('--slide-w', DESIGN_W);
  }

  function designHeight(el) {
    return el && el.offsetHeight > 0 ? el.offsetHeight : tokenSize('--slide-h', DESIGN_H);
  }

  function place(el) {
    var w = designWidth(el);
    var h = designHeight(el);
    var scale = Math.min(window.innerWidth / w, window.innerHeight / h);
    var tx = (window.innerWidth - w * scale) / 2;
    var ty = (window.innerHeight - h * scale) / 2;
    // Scaling about the top-left corner is what makes the translate above a
    // plain centring calculation. The default origin is the element's centre,
    // which would need the offset folded back in.
    el.style.transformOrigin = '0 0';
    el.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ')';
    return scale;
  }

  function clear(el) {
    el.style.transform = '';
    el.style.transformOrigin = '';
  }

  function fit() {
    if (!deckEl) return;
    // An opt-out for the case where the stylesheet would rather do the fitting
    // itself: --fit-scale is still published, so a CSS rule can use it.
    if (deckEl.getAttribute('data-fit') === 'css') {
      publish(measureOnly());
      return;
    }
    var scale;
    if (stage) {
      scale = place(stage);
    } else {
      // No stage element, so each slide is its own: only the one on screen
      // needs a transform, and leaving stale ones on the others would confuse
      // any measurement taken of them.
      var active = deckEl.querySelector('.slide.is-active') || slides[0];
      for (var i = 0; i < slides.length; i++) {
        if (slides[i] !== active) clear(slides[i]);
      }
      if (!active) return;
      scale = place(active);
    }
    publish(scale);
  }

  function measureOnly() {
    var el = stage || deckEl.querySelector('.slide.is-active') || slides[0] || deckEl;
    return Math.min(
      window.innerWidth / designWidth(el),
      window.innerHeight / designHeight(el)
    );
  }

  function publish(scale) {
    document.documentElement.style.setProperty('--fit-scale', String(scale));
  }

  function start() {
    deckEl = document.getElementById('deck');
    if (!deckEl) return;
    stage = document.querySelector('[data-stage]') || document.getElementById('stage');
    slides = Array.prototype.slice.call(deckEl.querySelectorAll('.slide'));

    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    document.addEventListener('fullscreenchange', fit);
    document.addEventListener('webkitfullscreenchange', fit);
    // Web fonts and late images do not change the stage, which is a fixed box,
    // but they do change when the browser first has a real box to measure.
    window.addEventListener('load', fit);
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(fit)['catch'](function () {});
    }

    if (window.Deck) window.Deck.on('change', fit);
    else document.addEventListener('deck:ready', function () { window.Deck.on('change', fit); }, { once: true });

    fit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
