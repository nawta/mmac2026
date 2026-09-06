(function () {
  'use strict';

  // Two windows, one talk. The deck window is the one on the projector; the
  // presenter window is the one on the laptop, and it carries the speaker
  // notes, the position in the deck, the clock, and controls that drive the
  // other window. Both ends of the link are this file: it decides which half
  // to be by whether the page it is on contains the deck.

  var CHANNEL = 'mmac-deck';
  var STORAGE_KEY = 'mmac-deck-sync';

  // ---- Transport ---------------------------------------------------------

  // Three ways of getting a message across, used together rather than in
  // sequence, because which of them works depends on where the deck is being
  // shown. BroadcastChannel is the good one and covers GitHub Pages. It does
  // not work between two file:// windows, where each document has its own
  // opaque origin, so a talk given from a folder on a laptop needs the other
  // two: localStorage, whose storage event fires in the other window, and a
  // direct postMessage to the window handle each side already holds. Messages
  // carry a sender and a sequence number, and anything seen twice is dropped.

  var selfId = 'w' + Math.random().toString(36).slice(2, 10);
  var seq = 0;
  var seen = [];
  var handlers = [];
  var peers = [];

  var bc = (function () {
    try { return new BroadcastChannel(CHANNEL); } catch (error) { return null; }
  })();

  function targetOrigin() {
    // A file:// page has an opaque origin, which postMessage will only accept
    // as '*'. Anywhere else the message is addressed to our own origin, so it
    // cannot be read by a window that is not part of this deck.
    return location.protocol === 'file:' ? '*' : location.origin;
  }

  function originTrusted(event) {
    if (event.origin === location.origin) return true;
    return event.origin === 'null' && location.protocol === 'file:';
  }

  function addPeer(win) {
    if (!win || win === window) return;
    for (var i = 0; i < peers.length; i++) if (peers[i] === win) return;
    peers.push(win);
  }

  function send(msg) {
    var envelope = { channel: CHANNEL, from: selfId, seq: ++seq, msg: msg };
    if (bc) {
      try { bc.postMessage(envelope); } catch (error) { /* channel closed */ }
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch (error) { /* private mode; the other transports still carry it */ }
    for (var i = 0; i < peers.length; i++) {
      try { peers[i].postMessage(envelope, targetOrigin()); } catch (error) { /* window closed */ }
    }
  }

  function deliver(envelope, trusted) {
    if (!envelope || envelope.channel !== CHANNEL || envelope.from === selfId) return;
    var key = envelope.from + ':' + envelope.seq;
    if (seen.indexOf(key) !== -1) return;
    seen.push(key);
    if (seen.length > 64) seen.shift();
    for (var i = 0; i < handlers.length; i++) {
      try { handlers[i](envelope.msg, trusted); } catch (error) {
        console.error('[notes] handler threw', error);
      }
    }
  }

  function receive(fn) {
    handlers.push(fn);
  }

  if (bc) bc.onmessage = function (event) { deliver(event.data, true); };

  window.addEventListener('storage', function (event) {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    // The storage event only ever fires for a same-origin document.
    try { deliver(JSON.parse(event.newValue), true); } catch (error) { /* not ours */ }
  });

  window.addEventListener('message', function (event) {
    if (!event.data || event.data.channel !== CHANNEL) return;
    // Notes are inserted as markup, so a message from a window that is not
    // part of this deck must not be able to reach that code path. Untrusted
    // messages are still delivered, and the receiver renders them as text.
    var trusted = originTrusted(event);
    addPeer(event.source);
    deliver(event.data, trusted);
  });

  addPeer(window.opener);

  // ---- Shared helpers ----------------------------------------------------

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function whenDeck(fn) {
    if (window.Deck) fn();
    else document.addEventListener('deck:ready', fn, { once: true });
  }

  function mmss(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function isTyping(target) {
    if (!target) return false;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  // ---- The deck window ---------------------------------------------------

  function initDeck() {
    var slides = Array.prototype.slice.call(document.querySelectorAll('#deck .slide'));

    function titleOf(slide) {
      var authored = slide.getAttribute('data-title');
      if (authored) return authored;
      var heading = slide.querySelector('h2') || slide.querySelector('h1');
      if (!heading) return '';
      // A <br> carries no whitespace of its own, so the two halves of a broken
      // heading would run together in the presenter's slide list.
      var clone = heading.cloneNode(true);
      var breaks = clone.querySelectorAll('br');
      for (var i = 0; i < breaks.length; i++) {
        breaks[i].parentNode.replaceChild(document.createTextNode(' '), breaks[i]);
      }
      return clone.textContent.replace(/\s+/g, ' ').trim();
    }

    function notesOf(slide) {
      var aside = slide && slide.querySelector('aside.notes');
      // The note goes across as markup rather than as flat text. A note has a
      // lead sentence and then the beats under it, and flattening it to a run
      // of characters is what makes notes hard to read at a lectern.
      return aside ? aside.innerHTML.trim() : '';
    }

    function fragmentCount(slide) {
      var nodes = slide ? slide.querySelectorAll('[data-fragment]') : [];
      var max = 0;
      for (var i = 0; i < nodes.length; i++) {
        var n = Number(nodes[i].getAttribute('data-fragment')) || 0;
        if (n > max) max = n;
      }
      return max;
    }

    // Read at send time rather than captured, so a site.js that loads after
    // this file still gets its clock across.
    function timerPayload() {
      if (!window.DeckTimer) return null;
      var t = window.DeckTimer.state();
      return {
        baseMs: t.baseMs,
        since: t.since,
        running: t.running,
        targetMinutes: t.targetMinutes || 0
      };
    }

    function broadcast() {
      var state = window.Deck.state;
      var slide = slides[state.index];
      send({
        type: 'state',
        index: state.index,
        total: state.total,
        fragmentStep: state.fragmentStep,
        fragments: fragmentCount(slide),
        mode: state.mode,
        blanked: state.mode === 'blank',
        title: slide ? titleOf(slide) : '',
        notes: notesOf(slide),
        timer: timerPayload()
      });
    }

    // The outline cannot change while the deck is open, so it goes out when
    // either window has just come up rather than with every navigation.
    function announce() {
      send({ type: 'outline', titles: slides.map(titleOf) });
      broadcast();
    }

    function navigate(msg) {
      var deck = window.Deck;
      if (msg.action === 'next') deck.next();
      else if (msg.action === 'prev') deck.prev();
      else if (msg.action === 'first') deck.goto(0, 0);
      else if (msg.action === 'last') deck.goto(deck.state.total - 1, 0);
      else if (msg.action === 'goto') deck.goto(Number(msg.index) || 0, 0);
      else if (msg.action === 'blank') {
        deck.setMode(deck.state.mode === 'blank' ? 'slide' : 'blank');
      }
    }

    function runTimer(msg) {
      if (!window.DeckTimer) return;
      if (msg.action === 'toggle') window.DeckTimer.toggle();
      else if (msg.action === 'start') window.DeckTimer.start();
      else if (msg.action === 'reset') window.DeckTimer.reset();
    }

    receive(function (msg) {
      if (!msg) return;
      if (msg.type === 'hello') announce();
      // goto/next/prev emit 'change' on their own, so the presenter is brought
      // up to date by the same broadcast a keypress on the deck would cause.
      else if (msg.type === 'nav') navigate(msg);
      else if (msg.type === 'timer') runTimer(msg);
    });

    window.Deck.on('change', broadcast);
    document.addEventListener('deck:timer', broadcast);
    announce();
  }

  // ---- The presenter window ----------------------------------------------

  function injectPresenterDefaults() {
    if (document.getElementById('deck-presenter-defaults')) return;
    var style = document.createElement('style');
    // Deliberately not named presenter-something: the test for whether the
    // page wrote its own console asks whether any presenter- id exists, and a
    // stylesheet this file injected would answer yes.
    style.id = 'deck-presenter-defaults';
    style.textContent = [
      '#presenter-root{box-sizing:border-box;height:100vh;padding:14px;display:grid;gap:12px;',
      'grid-template-columns:minmax(0,1fr) clamp(230px,22vw,400px);',
      'grid-template-rows:auto minmax(0,1fr) auto;',
      'font-family:var(--font-body,system-ui,sans-serif);color:var(--ink,#333);',
      'background:var(--bg,#FBF9F6);}',
      '#presenter-root *{box-sizing:border-box;}',
      '.pp{min-height:0;display:flex;flex-direction:column;gap:8px;padding:12px 16px;',
      'background:var(--surface,#fff);border:1px solid var(--line,#E3E0DA);border-radius:10px;}',
      '.pp--bar{grid-column:1/-1;flex-direction:row;align-items:center;gap:20px;}',
      '.pp__label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;',
      'color:var(--muted,#6B7280);}',
      '.pp__where{display:flex;align-items:baseline;gap:6px;font-variant-numeric:tabular-nums;}',
      '#presenter-position{font-size:34px;line-height:1;}',
      '#presenter-total{font-size:15px;color:var(--muted,#6B7280);}',
      '.pp__mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;}',
      '.pp__track{height:6px;border-radius:3px;background:var(--line,#E3E0DA);overflow:hidden;}',
      '#presenter-progress{height:100%;width:0;background:var(--accent,#3D6EA5);',
      'transition:width .18s ease;}',
      '.pp__next{display:flex;gap:10px;align-items:baseline;min-width:0;font-size:15px;}',
      '#presenter-next-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.pp__clock{display:flex;flex-direction:column;align-items:flex-end;gap:6px;}',
      '#presenter-elapsed{font-size:34px;line-height:1;font-variant-numeric:tabular-nums;}',
      '#presenter-elapsed.is-over{color:var(--em,#B25A3C);}',
      '#presenter-clock{font-size:13px;color:var(--muted,#6B7280);}',
      '#presenter-title{margin:0;font-size:20px;font-family:var(--font-display,inherit);}',
      '#presenter-notes{flex:1;min-height:0;overflow:auto;font-size:19px;line-height:1.55;}',
      '#presenter-notes p{margin:0 0 .7em;}',
      '#presenter-outline{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:2px;}',
      '#presenter-outline button{display:flex;gap:9px;width:100%;text-align:left;font:inherit;',
      'font-size:14px;padding:6px 8px;border:0;border-radius:6px;background:transparent;',
      'color:inherit;cursor:pointer;}',
      '#presenter-outline button:hover{background:var(--bg,#FBF9F6);}',
      '#presenter-outline button.is-current{background:var(--sky,#C4E0F9);}',
      '.pp__num{color:var(--muted,#6B7280);font-variant-numeric:tabular-nums;min-width:1.6em;}',
      '.pp--controls{grid-column:1/-1;flex-direction:row;align-items:center;gap:8px;}',
      '.pp__spacer{flex:1;}',
      '#presenter-root button{font:inherit;font-size:14px;padding:7px 12px;border-radius:7px;',
      'border:1px solid var(--line,#E3E0DA);background:var(--surface,#fff);color:var(--ink,#333);',
      'cursor:pointer;}',
      '#presenter-root .pp__head button:hover,.pp--controls button:hover{border-color:var(--accent,#3D6EA5);}',
      '#presenter-root button[disabled]{opacity:.4;cursor:default;}',
      '#presenter-blank[aria-pressed="true"]{background:var(--lemon,#F5F0C4);}',
      '.pp__head{display:flex;align-items:center;gap:10px;}'
    ].join('');
    var head = document.head || document.documentElement;
    head.insertBefore(style, head.firstChild);
  }

  function buildPresenter(root) {
    root.innerHTML = [
      '<header class="pp pp--bar">',
      '  <div class="pp__where"><span id="presenter-position">1</span>',
      '    <span id="presenter-total">/ 1</span></div>',
      '  <div class="pp__mid">',
      '    <div class="pp__track"><div id="presenter-progress"></div></div>',
      '    <p class="pp__next"><span class="pp__label">Next</span>',
      '      <span id="presenter-next-title">&mdash;</span></p>',
      '  </div>',
      '  <div class="pp__clock"><div id="presenter-elapsed">0:00</div>',
      '    <div id="presenter-clock">--:--</div>',
      '    <div><button id="presenter-timer-toggle" type="button">Start</button>',
      '      <button id="presenter-timer-reset" type="button">Reset</button></div></div>',
      '</header>',
      '<section class="pp">',
      '  <div class="pp__head"><span class="pp__label">Notes</span>',
      '    <span class="pp__label" id="presenter-step"></span>',
      '    <span class="pp__spacer"></span>',
      '    <button id="presenter-font-smaller" type="button" title="Smaller notes">A-</button>',
      '    <button id="presenter-font-larger" type="button" title="Larger notes">A+</button></div>',
      '  <h1 id="presenter-title">&mdash;</h1>',
      '  <div id="presenter-notes">Waiting for the deck window&hellip;</div>',
      '</section>',
      '<section class="pp">',
      '  <div class="pp__head"><span class="pp__label">Slides</span></div>',
      '  <div id="presenter-outline"></div>',
      '</section>',
      '<footer class="pp pp--controls">',
      '  <button id="presenter-first" type="button">First</button>',
      '  <button id="presenter-last" type="button">Last</button>',
      '  <button id="presenter-blank" type="button" aria-pressed="false">Blank</button>',
      '  <span class="pp__spacer"></span>',
      '  <button id="presenter-prev" type="button">&larr; Prev</button>',
      '  <button id="presenter-next" type="button">Next &rarr;</button>',
      '</footer>'
    ].join('\n');
  }

  function initPresenter() {
    // Asked first, before anything of ours is in the document: a root or a
    // stylesheet added here would itself answer the question. A page that wrote
    // its own console keeps it; this only furnishes an empty one.
    var authored = !!document.querySelector('[id^="presenter-"]:not(#presenter-root)');

    injectPresenterDefaults();

    var root = document.getElementById('presenter-root') ||
      document.querySelector('[data-presenter-root]');
    if (!root) {
      root = document.createElement('div');
      root.id = 'presenter-root';
      document.body.appendChild(root);
    }
    if (!authored) buildPresenter(root);

    function $(id) { return document.getElementById(id); }

    var el = {
      position: $('presenter-position'),
      total: $('presenter-total'),
      progress: $('presenter-progress'),
      nextTitle: $('presenter-next-title'),
      title: $('presenter-title'),
      step: $('presenter-step'),
      notes: $('presenter-notes'),
      outline: $('presenter-outline'),
      elapsed: $('presenter-elapsed'),
      clock: $('presenter-clock'),
      timerToggle: $('presenter-timer-toggle'),
      timerReset: $('presenter-timer-reset'),
      smaller: $('presenter-font-smaller'),
      larger: $('presenter-font-larger'),
      first: $('presenter-first'),
      last: $('presenter-last'),
      blank: $('presenter-blank'),
      prev: $('presenter-prev'),
      next: $('presenter-next')
    };

    var titles = [];
    var last = null;

    function nav(action, index) {
      send({ type: 'nav', action: action, index: index });
    }

    function timerCommand(action) {
      send({ type: 'timer', action: action });
    }

    function setText(node, value) {
      if (node) node.textContent = value;
    }

    function buildOutline(list) {
      titles = Array.isArray(list) ? list : [];
      if (!el.outline) return;
      el.outline.textContent = '';
      titles.forEach(function (title, i) {
        var button = document.createElement('button');
        button.type = 'button';
        var num = document.createElement('span');
        num.className = 'pp__num';
        num.textContent = String(i + 1);
        var label = document.createElement('span');
        label.textContent = title;
        button.appendChild(num);
        button.appendChild(label);
        button.addEventListener('click', function () { nav('goto', i); button.blur(); });
        el.outline.appendChild(button);
      });
      if (last) render(last, last.trusted);
    }

    function highlight(index) {
      if (!el.outline) return;
      var items = el.outline.children;
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('is-current', i === index);
      }
      if (items[index]) items[index].scrollIntoView({ block: 'nearest' });
    }

    function render(msg, trusted) {
      msg.trusted = !!trusted;
      last = msg;
      setText(el.position, String(msg.index + 1));
      setText(el.total, '/ ' + msg.total);
      if (el.progress) {
        el.progress.style.width = (msg.total ? (msg.index + 1) / msg.total * 100 : 0) + '%';
      }
      setText(el.title, msg.title || titles[msg.index] || '');
      // A fragment is a step within the slide, so the slide number on its own
      // does not say how far through the reveal the deck actually is.
      setText(el.step, msg.fragments ? 'Step ' + msg.fragmentStep + ' / ' + msg.fragments : '');
      if (el.notes) {
        if (trusted && msg.notes) el.notes.innerHTML = msg.notes;
        else if (msg.notes) el.notes.textContent = msg.notes.replace(/<[^>]*>/g, ' ');
        else el.notes.textContent = '(no notes for this slide)';
        // A long note left scrolled halfway is the wrong thing to hand the
        // speaker when the slide changes under them.
        el.notes.scrollTop = 0;
      }
      setText(el.nextTitle, msg.index + 1 < msg.total ? (titles[msg.index + 1] || '') : '(end)');
      if (el.blank) el.blank.setAttribute('aria-pressed', String(!!msg.blanked));
      // Fragments count as steps, so the two ends are the first slide with
      // nothing revealed and the last slide with everything revealed.
      if (el.prev) el.prev.disabled = msg.index === 0 && !msg.fragmentStep;
      if (el.next) el.next.disabled = msg.index === msg.total - 1 && msg.fragmentStep >= msg.fragments;
      highlight(msg.index);
      paintClock();
    }

    // The deck owns the clock; this window is told where it started and works
    // out the reading itself, so it ticks smoothly without a message a second.
    function elapsedMs() {
      var t = last && last.timer;
      if (!t) return 0;
      return (t.baseMs || 0) + (t.since ? Date.now() - t.since : 0);
    }

    function paintClock() {
      var running = !!(last && last.timer && last.timer.since);
      var ms = elapsedMs();
      var target = (last && last.timer && last.timer.targetMinutes) || 0;
      if (el.elapsed) {
        el.elapsed.textContent = mmss(ms);
        el.elapsed.classList.toggle('is-over', target > 0 && ms > target * 60 * 1000);
      }
      if (el.timerToggle) {
        el.timerToggle.textContent = running ? 'Pause' : (ms ? 'Resume' : 'Start');
      }
      if (el.clock) {
        var now = new Date();
        el.clock.textContent = String(now.getHours()).padStart(2, '0') + ':' +
          String(now.getMinutes()).padStart(2, '0');
      }
    }

    // ---- Notes font size -------------------------------------------------

    var FONT_KEY = 'mmac-presenter-font';
    var fontSize = 1.2;
    try {
      var saved = parseFloat(localStorage.getItem(FONT_KEY));
      if (saved > 0) fontSize = saved;
    } catch (error) { /* private mode */ }

    function applyFont() {
      fontSize = Math.min(2.4, Math.max(0.9, Math.round(fontSize * 10) / 10));
      if (el.notes) el.notes.style.fontSize = fontSize + 'rem';
      try { localStorage.setItem(FONT_KEY, String(fontSize)); } catch (error) { /* ignore */ }
    }

    function bumpFont(delta) {
      fontSize += delta;
      applyFont();
    }

    // ---- Wiring ----------------------------------------------------------

    // The deck window is the one being projected, so it is usually not the
    // window with focus. Every control here drives it remotely.
    function bind(node, fn) {
      if (!node) return;
      node.addEventListener('click', function () { fn(); node.blur(); });
    }

    bind(el.prev, function () { nav('prev'); });
    bind(el.next, function () { nav('next'); });
    bind(el.first, function () { nav('first'); });
    bind(el.last, function () { nav('last'); });
    bind(el.blank, function () { nav('blank'); });
    bind(el.timerToggle, function () { timerCommand('toggle'); });
    bind(el.timerReset, function () { timerCommand('reset'); });
    bind(el.smaller, function () { bumpFont(-0.1); });
    bind(el.larger, function () { bumpFont(0.1); });

    window.addEventListener('keydown', function (event) {
      if (event.defaultPrevented || isTyping(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Space and Enter on a focused button already fire a click; handling the
      // key here as well would advance the deck twice.
      if (event.target && event.target.tagName === 'BUTTON' &&
          (event.key === ' ' || event.key === 'Enter')) return;
      switch (event.key) {
        case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': case 'n':
          nav('next'); break;
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'p':
          nav('prev'); break;
        case 'Home': nav('first'); break;
        case 'End': nav('last'); break;
        case 'b': case 'B': nav('blank'); break;
        case 't': timerCommand('toggle'); break;
        case 'R': timerCommand('reset'); break;
        case '+': case '=': bumpFont(0.1); break;
        case '-': bumpFont(-0.1); break;
        default: return;
      }
      event.preventDefault();
    });

    receive(function (msg, trusted) {
      if (!msg) return;
      if (msg.type === 'state') render(msg, trusted);
      else if (msg.type === 'outline') buildOutline(msg.titles);
    });

    applyFont();
    paintClock();
    window.setInterval(paintClock, 1000);

    // The deck answers hello with the outline and the current slide. It is
    // asked again a few times because the deck window may still be parsing
    // when this one comes up, and on the localStorage path a message written
    // before the other window is listening is simply not delivered.
    var asks = 0;
    send({ type: 'hello' });
    var askTimer = window.setInterval(function () {
      if (last || asks >= 6) {
        window.clearInterval(askTimer);
        return;
      }
      asks += 1;
      send({ type: 'hello' });
    }, 700);
  }

  // ---- Pick a side -------------------------------------------------------

  ready(function () {
    if (document.getElementById('deck')) whenDeck(initDeck);
    else initPresenter();
  });
})();
