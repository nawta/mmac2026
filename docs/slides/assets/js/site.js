(function () {
  'use strict';

  // The chrome around the slides: where you are in the deck, how far through
  // it you have got, the key that blanks the screen, the button that opens the
  // presenter window, and the clock that says how long you have been talking.
  //
  // The markup is built here rather than written into index.html because none
  // of it is content. A page that does supply its own chrome keeps it: if any
  // of the ids below already exist, this file binds to what is there and adds
  // nothing, so the two never end up half of each.

  var IDS = ['deck-chrome', 'deck-counter', 'deck-progress', 'deck-timer',
             'deck-presenter-open', 'deck-fullscreen'];

  var TIMER_KEY = 'mmac-deck-timer';
  // A record left over from last week's rehearsal should not come back as a
  // talk that has been running for four days.
  var TIMER_MAX_AGE_MS = 3 * 60 * 60 * 1000;

  var timer = { baseMs: 0, since: null };
  var timerListeners = [];
  var targetMinutes = 12;
  var els = {};

  // ---- Defaults ----------------------------------------------------------

  // Inserted as the first stylesheet in <head> so every rule here loses to
  // site.css. It exists so the chrome is legible on a page whose stylesheet
  // has no opinion about it yet, not to decide how the chrome looks.
  function injectDefaults() {
    if (document.getElementById('deck-chrome-defaults')) return;
    var style = document.createElement('style');
    style.id = 'deck-chrome-defaults';
    style.textContent = [
      '#deck-chrome{position:fixed;left:0;right:0;bottom:0;z-index:800;',
      'font-family:var(--font-body,system-ui,sans-serif);font-size:13px;color:var(--muted,#6B7280);}',
      '#deck-chrome .deck-chrome__track{height:3px;background:var(--line,#E3E0DA);}',
      '#deck-chrome .deck-chrome__fill{height:100%;width:0;background:var(--accent,#3D6EA5);',
      'transition:width .18s ease;}',
      '#deck-chrome .deck-chrome__row{display:flex;align-items:center;gap:14px;',
      'padding:8px 18px;background:var(--bg,#FBF9F6);border-top:1px solid var(--line,#E3E0DA);}',
      '#deck-chrome .deck-chrome__spacer{flex:1;}',
      '#deck-counter{font-variant-numeric:tabular-nums;color:var(--ink,#333);}',
      '#deck-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#deck-chrome button{font:inherit;color:var(--ink,#333);background:var(--surface,#fff);',
      'border:1px solid var(--line,#E3E0DA);border-radius:6px;padding:5px 10px;cursor:pointer;}',
      '#deck-chrome button:hover{border-color:var(--accent,#3D6EA5);}',
      '#deck-timer{font-variant-numeric:tabular-nums;}',
      '#deck-timer.is-running{border-color:var(--accent,#3D6EA5);}',
      '#deck-timer.is-over{color:var(--em,#B25A3C);border-color:var(--em,#B25A3C);}',
      // The buttons fade out of the way once the talk is under way and come
      // back the moment the mouse moves, so they are neither on the projector
      // for twelve minutes nor gone when they are wanted.
      '#deck-chrome .deck-chrome__row{transition:opacity .4s ease;}',
      '#deck-chrome.is-idle .deck-chrome__row{opacity:.18;}',
      '#deck-chrome.is-idle:hover .deck-chrome__row{opacity:1;}',
      'body.is-blanked{background:#000;}',
      'body.is-blanked #deck,body.is-blanked #deck-chrome{visibility:hidden;}',
      '@media print{#deck-chrome{display:none;}}'
    ].join('');
    var head = document.head || document.documentElement;
    head.insertBefore(style, head.firstChild);
  }

  // ---- Markup ------------------------------------------------------------

  function make(tag, id, className, text) {
    var el = document.createElement(tag);
    if (id) el.id = id;
    if (className) el.className = className;
    if (text) el.textContent = text;
    if (tag === 'button') el.type = 'button';
    return el;
  }

  function build() {
    var bar = make('div', 'deck-chrome');
    bar.setAttribute('data-overflow-ignore', '');

    var track = make('div', 'deck-progress', 'deck-chrome__track');
    track.appendChild(make('div', 'deck-progress-fill', 'deck-chrome__fill'));

    var row = make('div', null, 'deck-chrome__row');
    row.appendChild(make('span', 'deck-counter', null, '1 / 1'));
    row.appendChild(make('span', 'deck-label'));
    row.appendChild(make('span', null, 'deck-chrome__spacer'));

    var clock = make('button', 'deck-timer', null, '0:00');
    clock.title = 'Talk timer: click or press t to start and pause, shift+R to reset';
    row.appendChild(clock);

    var presenter = make('button', 'deck-presenter-open', null, 'Presenter');
    presenter.title = 'Open the presenter window (s)';
    row.appendChild(presenter);

    var full = make('button', 'deck-fullscreen', null, 'Full screen');
    full.title = 'Full screen (f)';
    row.appendChild(full);

    bar.appendChild(track);
    bar.appendChild(row);
    document.body.appendChild(bar);
  }

  function collect() {
    els.chrome = document.getElementById('deck-chrome');
    els.counter = document.getElementById('deck-counter');
    els.label = document.getElementById('deck-label');
    els.progress = document.getElementById('deck-progress');
    els.timer = document.getElementById('deck-timer');
    els.presenter = document.getElementById('deck-presenter-open');
    els.fill = document.getElementById('deck-progress-fill') ||
      (els.progress && els.progress.firstElementChild) || null;
  }

  // ---- Progress and position ---------------------------------------------

  function slideTitle(index) {
    var slides = document.querySelectorAll('#deck .slide');
    var slide = slides[index];
    if (!slide) return '';
    var authored = slide.getAttribute('data-title');
    if (authored) return authored;
    var heading = slide.querySelector('h2, h1');
    return heading ? heading.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function syncPosition() {
    var state = window.Deck.state;
    var fraction = state.total ? (state.index + 1) / state.total : 0;
    var percent = (fraction * 100).toFixed(2) + '%';
    // Published as a custom property too, so a stylesheet can drive a progress
    // indicator of its own without this file knowing about it.
    document.documentElement.style.setProperty('--deck-progress', percent);
    if (els.fill) els.fill.style.width = percent;
    if (els.counter) els.counter.textContent = (state.index + 1) + ' / ' + state.total;
    if (els.label) els.label.textContent = slideTitle(state.index);
    if (els.progress) {
      els.progress.setAttribute('role', 'progressbar');
      els.progress.setAttribute('aria-valuemin', '1');
      els.progress.setAttribute('aria-valuemax', String(state.total));
      els.progress.setAttribute('aria-valuenow', String(state.index + 1));
    }
  }

  // ---- Blank -------------------------------------------------------------

  function blanked() {
    return window.Deck.state.mode === 'blank';
  }

  function setBlank(on) {
    window.Deck.setMode(on ? 'blank' : 'slide');
  }

  function toggleBlank() {
    setBlank(!blanked());
  }

  // ---- Talk timer --------------------------------------------------------

  function loadTimer() {
    try {
      var raw = JSON.parse(localStorage.getItem(TIMER_KEY));
      if (raw && typeof raw.saved === 'number' && Date.now() - raw.saved < TIMER_MAX_AGE_MS) {
        return { baseMs: raw.baseMs || 0, since: raw.since || null };
      }
    } catch (error) { /* private mode, or a stale record in the wrong shape */ }
    return { baseMs: 0, since: null };
  }

  function saveTimer() {
    try {
      localStorage.setItem(TIMER_KEY, JSON.stringify({
        baseMs: timer.baseMs, since: timer.since, saved: Date.now()
      }));
    } catch (error) { /* nothing to do; the clock still runs in this window */ }
  }

  // `since` is an absolute timestamp rather than an accumulated count, so a
  // reload in the middle of a talk resumes at the right reading instead of the
  // reading it had when it was last written.
  function elapsedMs() {
    return timer.baseMs + (timer.since ? Date.now() - timer.since : 0);
  }

  function announceTimer() {
    for (var i = 0; i < timerListeners.length; i++) {
      try { timerListeners[i](timerState()); } catch (error) { /* not this file's problem */ }
    }
    // An event as well as the callback list, so notes.js can pick the clock up
    // whatever order the two files happen to be loaded in.
    document.dispatchEvent(new CustomEvent('deck:timer', { detail: timerState() }));
  }

  function timerState() {
    return {
      baseMs: timer.baseMs,
      since: timer.since,
      running: !!timer.since,
      elapsedMs: elapsedMs(),
      targetMinutes: targetMinutes
    };
  }

  function startTimer() {
    if (timer.since) return; // starting a running clock has to be a no-op
    timer.since = Date.now();
    saveTimer();
    paintTimer();
    announceTimer();
  }

  function toggleTimer() {
    if (timer.since) {
      timer.baseMs += Date.now() - timer.since;
      timer.since = null;
    } else {
      timer.since = Date.now();
    }
    saveTimer();
    paintTimer();
    announceTimer();
  }

  function resetTimer() {
    timer = { baseMs: 0, since: null };
    saveTimer();
    paintTimer();
    announceTimer();
  }

  function mmss(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function paintTimer() {
    if (!els.timer) return;
    var ms = elapsedMs();
    els.timer.textContent = mmss(ms);
    els.timer.classList.toggle('is-running', !!timer.since);
    els.timer.classList.toggle('is-over', ms > targetMinutes * 60 * 1000);
  }

  // ---- Presenter window --------------------------------------------------

  function openPresenter() {
    var win = window.open('presenter.html', 'mmac-presenter', 'width=1440,height=900');
    // notes.js learns the window from the hello message the presenter sends,
    // so nothing has to be handed over here.
    if (!win) console.warn('[deck] the presenter window was blocked by the browser');
    return win;
  }

  // ---- Idle chrome -------------------------------------------------------

  function watchIdle() {
    if (!els.chrome) return;
    var timeoutId = null;
    function wake() {
      els.chrome.classList.remove('is-idle');
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(function () {
        els.chrome.classList.add('is-idle');
      }, 2500);
    }
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    wake();
  }

  // ---- Keys --------------------------------------------------------------

  function isTyping(target) {
    if (!target) return false;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function onKey(event) {
    if (event.defaultPrevented || isTyping(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    switch (event.key) {
      case 'b': case 'B': toggleBlank(); break;
      case 's': openPresenter(); break;
      case 't': toggleTimer(); break;
      // Reset sits on the shifted key. A stray press of the key next to it
      // should not cost the only record of how long the talk has run.
      case 'R': resetTimer(); break;
      case 'Escape': if (!blanked()) return; setBlank(false); break;
      default: return;
    }
    event.preventDefault();
  }

  // ---- Start -------------------------------------------------------------

  function start() {
    var deckEl = document.getElementById('deck');
    if (!deckEl) return;

    injectDefaults();
    var authored = false;
    for (var i = 0; i < IDS.length; i++) {
      if (document.getElementById(IDS[i])) authored = true;
    }
    if (!authored) build();
    collect();

    var minutes = Number(deckEl.getAttribute('data-talk-minutes'));
    if (minutes > 0) targetMinutes = minutes;
    timer = loadTimer();

    if (els.timer) {
      els.timer.addEventListener('click', function () {
        toggleTimer();
        // Otherwise Space would press the button again instead of advancing.
        els.timer.blur();
      });
    }
    if (els.presenter) {
      els.presenter.addEventListener('click', function () {
        openPresenter();
        els.presenter.blur();
      });
    }

    window.addEventListener('keydown', onKey);
    window.setInterval(paintTimer, 1000);
    paintTimer();
    watchIdle();

    window.Deck.on('change', syncPosition);
    syncPosition();
  }

  window.DeckTimer = {
    state: timerState,
    start: startTimer,
    toggle: toggleTimer,
    reset: resetTimer,
    onChange: function (fn) { timerListeners.push(fn); }
  };
  window.DeckChrome = {
    blank: setBlank,
    toggleBlank: toggleBlank,
    isBlanked: function () { return !!window.Deck && blanked(); },
    openPresenter: openPresenter
  };

  if (window.Deck) start();
  else document.addEventListener('deck:ready', start, { once: true });
})();
