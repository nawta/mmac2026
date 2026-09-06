(function () {
  'use strict';

  // The deck core: which slide is showing, how many fragments of it are
  // revealed, the keyboard, the ?s=&f= query the URL carries, and the mounting
  // of every [data-chart] on the page. Everything else in assets/js/ hangs off
  // the window.Deck API this file publishes.

  var state = { index: 0, total: 0, mode: 'slide', fragmentStep: 0 };
  var listeners = {};

  var deckEl = null;
  var slides = [];
  var charts = [];        // {el, name, handle, entered}
  var auditing = false;   // suppresses the chart resize observer, see audit()

  function toArray(nodes) {
    return Array.prototype.slice.call(nodes);
  }

  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
  }

  function emit(event) {
    var fns = listeners[event] || [];
    for (var i = 0; i < fns.length; i++) {
      // One listener throwing must not stop the ones registered after it.
      // Navigation is the thing the whole room is watching; a broken widget
      // does not get to freeze it.
      try {
        fns[i](state);
      } catch (error) {
        console.error('[deck] a "' + event + '" listener threw', error);
      }
    }
  }

  // ---- Fragments ---------------------------------------------------------

  // The number of steps is the highest data-fragment number on the slide, not
  // the count of elements carrying one: two elements may share step 2 so that
  // they appear together, and counting them would add a step that reveals
  // nothing and looks to the room like a dead press of the clicker.
  function fragmentSteps(slide) {
    var nodes = slide.querySelectorAll('[data-fragment]');
    var max = 0;
    for (var i = 0; i < nodes.length; i++) {
      var n = Number(nodes[i].getAttribute('data-fragment')) || 0;
      if (n > max) max = n;
    }
    return max;
  }

  function applyFragments(slide, step) {
    var nodes = slide.querySelectorAll('[data-fragment]');
    for (var i = 0; i < nodes.length; i++) {
      var n = Number(nodes[i].getAttribute('data-fragment')) || 0;
      nodes[i].classList.toggle('is-visible', n <= step);
    }
  }

  // ---- Rendering ---------------------------------------------------------

  function render() {
    for (var i = 0; i < slides.length; i++) {
      slides[i].classList.toggle('is-active', i === state.index);
    }
    var active = slides[state.index];
    if (!active) return;
    applyFragments(active, state.fragmentStep);
    document.body.setAttribute('data-mode', state.mode);
    deckEl.setAttribute('data-index', String(state.index));
  }

  // ---- The URL -----------------------------------------------------------

  // ?s= is the zero-based state.index, the same number window.Deck.state
  // reports, and ?f= the fragment step. Other query parameters are left alone
  // so a link can carry both a slide and whatever else it was carrying.
  function syncUrl(push) {
    var params = new URLSearchParams(location.search);
    params.set('s', String(state.index));
    if (state.fragmentStep) params.set('f', String(state.fragmentStep));
    else params.delete('f');
    var query = params.toString();
    var url = location.pathname + (query ? '?' + query : '') + location.hash;
    try {
      if (push) history.pushState(null, '', url);
      else history.replaceState(null, '', url);
    } catch (error) {
      // Chrome refuses history writes on file:// because the origin is opaque.
      // The deck still runs from a local folder; it just cannot deep-link.
    }
  }

  function readUrl() {
    var params = new URLSearchParams(location.search);
    return {
      index: clampIndex(Number(params.get('s')) || 0),
      fragmentStep: Math.max(0, Number(params.get('f')) || 0)
    };
  }

  function clampIndex(i) {
    if (!slides.length) return 0;
    return Math.max(0, Math.min(slides.length - 1, Math.floor(i) || 0));
  }

  // ---- Navigation --------------------------------------------------------

  function commit(pushHistory) {
    render();
    syncUrl(pushHistory);
    emit('change');
  }

  function goTo(index, step) {
    var target = clampIndex(index);
    var slide = slides[target];
    var max = slide ? fragmentSteps(slide) : 0;
    var changedSlide = target !== state.index;
    state.index = target;
    state.fragmentStep = Math.max(0, Math.min(max, Math.floor(step) || 0));
    // A slide change earns a history entry so Back returns to the previous
    // slide. A fragment step rewrites the current entry instead: walking the
    // reveal of one slide backwards through the browser's history is not what
    // anyone presses Back for.
    commit(changedSlide);
  }

  function next() {
    var slide = slides[state.index];
    if (!slide) return;
    if (state.fragmentStep < fragmentSteps(slide)) {
      state.fragmentStep += 1;
      commit(false);
      return;
    }
    if (state.index < slides.length - 1) goTo(state.index + 1, 0);
  }

  function prev() {
    if (state.fragmentStep > 0) {
      state.fragmentStep -= 1;
      commit(false);
      return;
    }
    if (state.index > 0) {
      // Stepping back into a slide shows it as it was left, fully revealed,
      // rather than replaying its build.
      goTo(state.index - 1, fragmentSteps(slides[state.index - 1]));
    }
  }

  function setMode(mode) {
    var value = mode === 'blank' ? 'blank' : 'slide';
    if (value === state.mode) return;
    state.mode = value;
    document.body.setAttribute('data-mode', value);
    document.body.classList.toggle('is-blanked', value === 'blank');
    emit('change');
  }

  // ---- Keyboard ----------------------------------------------------------

  function isTyping(target) {
    if (!target) return false;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function onKey(event) {
    if (event.defaultPrevented || isTyping(event.target)) return;
    // Cmd+Left is the browser's Back and Ctrl+N opens a window. A deck that
    // swallowed those would be worse than one with no shortcuts at all.
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case ' ':
      case 'PageDown':
      case 'n':
        next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
      case 'p':
        prev();
        break;
      case 'Home':
        goTo(0, 0);
        break;
      case 'End':
        goTo(slides.length - 1, 0);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  // ---- Charts ------------------------------------------------------------

  // A slide that is not showing usually has no layout at all, so a chart
  // mounted inside one would be handed a zero-width box and draw nothing until
  // something resized it. Making the slide measurable for the length of one
  // synchronous call gives ECharts the real 16:9 geometry to size against. The
  // browser paints at the end of the task, after the restore, so nothing of
  // this reaches the screen.
  function measurable(slide, fn) {
    if (slide.classList.contains('is-active')) return fn();
    var transform = slide.style.transform;
    var visibility = slide.style.visibility;
    slide.classList.add('is-active');
    slide.style.visibility = 'hidden';
    slide.style.transform = 'none';
    try {
      return fn();
    } finally {
      slide.classList.remove('is-active');
      slide.style.visibility = visibility;
      slide.style.transform = transform;
    }
  }

  function mountChart(el) {
    if (el.hasAttribute('data-chart-mounted')) return;
    var name = el.getAttribute('data-chart');
    var key = el.getAttribute('data-src');
    var mod = window.DeckCharts && window.DeckCharts[name];
    var data = key ? (window.DeckData && window.DeckData[key]) : undefined;

    if (!mod || typeof mod.init !== 'function') {
      console.warn('[deck] no chart module named "' + name + '"');
      return;
    }
    if (key && data === undefined) {
      console.warn('[deck] chart "' + name + '" wants DeckData["' + key + '"], which is not loaded');
      return;
    }

    var handle;
    try {
      handle = mod.init(el, data);
    } catch (error) {
      // One figure that throws costs one figure. It must not take the rest of
      // this file with it, because window.Deck is assigned below and every
      // deep link and every other module hangs off it.
      console.error('[deck] chart "' + name + '" failed to mount', error);
      return;
    }
    if (!handle) return;

    el.setAttribute('data-chart-mounted', '');
    var record = { el: el, name: name, handle: handle, entered: false };
    charts.push(record);

    if (window.ResizeObserver && typeof handle.resize === 'function') {
      new ResizeObserver(function () {
        // The audit gives every slide a real box for one synchronous call and
        // then takes it away again. Those two sizes reach the observer as one
        // delivery at the end of the frame, which is why the flag is held
        // until then rather than dropped when the loop ends.
        if (auditing) return;
        call(record, 'resize');
      }).observe(el);
    }
  }

  function call(record, method) {
    var fn = record.handle[method];
    if (typeof fn !== 'function') return;
    try {
      fn.call(record.handle);
    } catch (error) {
      console.error('[deck] chart "' + record.name + '" threw in ' + method + '()', error);
    }
  }

  function mountCharts() {
    if (window.DeckTheme && typeof window.DeckTheme.register === 'function') {
      window.DeckTheme.register();
    }
    for (var i = 0; i < slides.length; i++) {
      var nodes = slides[i].querySelectorAll('[data-chart]');
      if (!nodes.length) continue;
      measurable(slides[i], (function (list) {
        return function () {
          for (var j = 0; j < list.length; j++) mountChart(list[j]);
        };
      })(nodes));
    }
    // Charts outside any slide, if a page ever grows one.
    var loose = document.querySelectorAll('[data-chart]:not([data-chart-mounted])');
    for (var k = 0; k < loose.length; k++) {
      if (!loose[k].closest('.slide')) mountChart(loose[k]);
    }
  }

  // onEnter starts an animation, so it fires when the slide arrives and not
  // again on every fragment step within it.
  function updateChartLifecycle() {
    var active = slides[state.index];
    for (var i = 0; i < charts.length; i++) {
      var record = charts[i];
      var inside = !!(active && active.contains(record.el));
      if (inside && !record.entered) {
        record.entered = true;
        call(record, 'resize');
        call(record, 'onEnter');
      } else if (!inside && record.entered) {
        record.entered = false;
        call(record, 'onLeave');
      }
    }
  }

  // ---- Overflow audit ----------------------------------------------------

  // A slide is a fixed 16:9 box, so content that does not fit is simply lost
  // off the bottom edge, and the person who finds out is the speaker, on
  // stage. This says so in the console instead, naming the slide id and the
  // element that sticks out furthest.

  function describe(el) {
    if (!el) return 'unknown';
    if (el.id) return '#' + el.id;
    var cls = (el.getAttribute('class') || '').trim().split(/\s+/)[0];
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  }

  function worstOffender(slide, scale) {
    var frame = slide.getBoundingClientRect();
    var nodes = slide.querySelectorAll('*');
    var worst = null;
    var worstBy = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.closest('[data-overflow-ignore]')) continue;
      // Speaker notes live in the DOM but never render in the deck; a rule
      // that hides them with anything but display:none would otherwise report
      // every slide as broken.
      if (el.closest('aside.notes')) continue;
      var box = el.getBoundingClientRect();
      if (!box.width && !box.height) continue;
      if (getComputedStyle(el).position === 'fixed') continue;
      var over = Math.max(
        box.bottom - frame.bottom,
        box.right - frame.right,
        frame.top - box.top,
        frame.left - box.left
      );
      // A box that overflows drags its ancestors out with it, and all of them
      // stick out by the same amount. Naming the innermost one points at the
      // thing to edit rather than at the wrapper it happens to sit in.
      var better = worst === null
        ? over > 0
        : (over > worstBy + 0.5 || (over >= worstBy - 0.5 && worst.contains(el)));
      if (better) {
        worstBy = Math.max(worstBy, over);
        worst = el;
      }
    }
    return worst && worstBy / scale > 1.5 ? worst : null;
  }

  function auditSlide(slide) {
    return measurable(slide, function () {
      var frame = slide.getBoundingClientRect();
      var scale = frame.width && slide.offsetWidth ? frame.width / slide.offsetWidth : 1;
      // scrollWidth and scrollHeight are layout values, so the transform fit.js
      // puts on the active slide does not enter into them.
      var overX = slide.scrollWidth - slide.clientWidth;
      var overY = slide.scrollHeight - slide.clientHeight;
      if (overX <= 1 && overY <= 1) return null;
      return {
        id: slide.id || describe(slide),
        title: slide.getAttribute('data-title') || '',
        x: Math.round(overX),
        y: Math.round(overY),
        worst: describe(worstOffender(slide, scale || 1))
      };
    });
  }

  function releaseAudit() {
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { auditing = false; });
    } else {
      auditing = false;
    }
  }

  function audit() {
    auditing = true;
    var found = [];
    try {
      for (var i = 0; i < slides.length; i++) {
        if (slides[i].hasAttribute('data-overflow-ignore')) continue;
        var result = auditSlide(slides[i]);
        if (result) found.push(result);
      }
    } finally {
      releaseAudit();
    }
    for (var j = 0; j < found.length; j++) {
      var f = found[j];
      var axes = [];
      if (f.y > 1) axes.push(f.y + 'px below the bottom edge');
      if (f.x > 1) axes.push(f.x + 'px past the right edge');
      console.warn(
        '[deck] slide ' + f.id + (f.title ? ' ("' + f.title + '")' : '') +
        ' overflows its frame: ' + axes.join(' and ') +
        '. Furthest element: ' + f.worst + '.'
      );
    }
    return found;
  }

  // ---- Start -------------------------------------------------------------

  function afterSettled(fn) {
    function run() {
      // Web fonts change the height of every paragraph, so measuring before
      // they land reports overflow that is not there and misses overflow that
      // is.
      if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(function () {
          window.setTimeout(fn, 120);
        })['catch'](function () {
          window.setTimeout(fn, 250);
        });
      } else {
        window.setTimeout(fn, 250);
      }
    }
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run, { once: true });
  }

  function start() {
    deckEl = document.getElementById('deck');
    if (!deckEl) return; // presenter.html and anything else that is not the deck
    slides = toArray(deckEl.querySelectorAll('.slide'));
    state.total = slides.length;
    if (!slides.length) {
      console.warn('[deck] #deck contains no .slide elements');
      return;
    }

    var from = readUrl();
    state.index = from.index;
    state.fragmentStep = Math.min(from.fragmentStep, fragmentSteps(slides[from.index]));

    render();
    syncUrl(false);

    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', function () {
      var target = readUrl();
      state.index = target.index;
      state.fragmentStep = Math.min(target.fragmentStep, fragmentSteps(slides[target.index]));
      render();
      emit('change');
    });

    on('change', updateChartLifecycle);

    window.Deck = {
      state: state,
      goto: goTo,
      next: next,
      prev: prev,
      on: on,
      setMode: setMode,
      audit: audit,
      mountCharts: mountCharts
    };
    document.dispatchEvent(new CustomEvent('deck:ready', { detail: state }));
    emit('change');

    mountCharts();
    updateChartLifecycle();
    afterSettled(audit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
