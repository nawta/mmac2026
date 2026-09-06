(function () {
  'use strict';

  // Formulas are authored as LaTeX in a data-math attribute rather than as
  // pre-rendered markup, so the source stays readable beside the prose it
  // belongs to:
  //
  //   <span data-math="\rho = +0.500"></span>
  //   <div data-math="\bar{z} = \frac{1}{M}\sum_i z_i" data-math-display="block"></div>
  //
  // KaTeX is bundled under assets/vendor/katex/, so this runs from file:// with
  // no network.

  function render(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-math]:not([data-math-done])');
    if (!nodes.length) return 0;

    if (!window.katex || typeof window.katex.render !== 'function') {
      console.warn('[math] KaTeX is not loaded; ' + nodes.length + ' formula(s) left as written');
      return 0;
    }

    var done = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var source = el.getAttribute('data-math');
      try {
        window.katex.render(source, el, {
          displayMode: el.getAttribute('data-math-display') === 'block',
          // A malformed formula should show up as red text on the slide, where
          // the author will see it, rather than stopping the script and taking
          // every later formula with it.
          throwOnError: false,
          strict: 'ignore'
        });
        el.setAttribute('data-math-done', '');
        done += 1;
      } catch (error) {
        console.error('[math] could not render: ' + source, error);
      }
    }
    return done;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { render(); }, { once: true });
  } else {
    render();
  }

  window.DeckMath = { render: render };
})();
