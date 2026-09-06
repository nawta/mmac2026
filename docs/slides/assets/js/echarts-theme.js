(function () {
  'use strict';

  // The ECharts theme the deck's charts are drawn with. Chart modules call
  // echarts.init(el, 'mmac') and say nothing about colour, so the palette
  // lives in exactly one place: the custom properties deck.css defines.
  //
  // The CONTRACT values are repeated below as fallbacks because this file can
  // run before the stylesheet has been applied (a <script> in <head> ahead of
  // the <link>, or a page opened from file:// where the CSS arrives late).
  // Reading an empty string from getComputedStyle would otherwise hand ECharts
  // an invalid colour and every series would come out black.

  var NAME = 'mmac';

  var FALLBACK = {
    '--peach': '#FFD4C4',
    '--sky': '#C4E0F9',
    '--mint': '#C4F0DC',
    '--lavender': '#D8C4F0',
    '--lemon': '#F5F0C4',
    '--ink': '#333333',
    '--muted': '#6B7280',
    '--line': '#E3E0DA',
    '--bg': '#FBF9F6',
    '--surface': '#FFFFFF',
    '--accent': '#3D6EA5',
    '--em': '#B25A3C',
    '--font-body': '"Outfit", system-ui, -apple-system, "Segoe UI", sans-serif'
  };

  function token(name) {
    var value = '';
    try {
      value = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .replace(/\s+/g, ' ')
        .trim();
    } catch (error) {
      value = '';
    }
    return value || FALLBACK[name] || '';
  }

  function option() {
    var ink = token('--ink');
    var muted = token('--muted');
    var line = token('--line');
    var surface = token('--surface');
    var accent = token('--accent');
    var font = token('--font-body');

    // One type scale for all six charts, so a reader moving between them is
    // not asked to read the same kind of label at three sizes. What an axis
    // measures is 15px, the labels along it are 14, a legend is 14, and the
    // caption a chart carries under its plot is 13. Colour follows what the
    // label is: the names of things are ink, because they are the data, and
    // everything that frames them is muted.
    var axis = {
      axisLine: { show: true, lineStyle: { color: line } },
      axisTick: { show: false },
      axisLabel: { color: muted, fontFamily: font, fontSize: 14 },
      splitLine: { show: false, lineStyle: { color: line, type: 'solid' } },
      nameTextStyle: { color: muted, fontFamily: font, fontSize: 15 }
    };

    return {
      // The contract fixes this order: peach, sky, mint, lavender, lemon.
      color: [
        token('--peach'),
        token('--sky'),
        token('--mint'),
        token('--lavender'),
        token('--lemon')
      ],
      // The slide behind the chart already carries the ground colour, and a
      // white rectangle inside a tinted card is visible at projector contrast.
      backgroundColor: 'transparent',
      textStyle: { color: ink, fontFamily: font, fontSize: 16 },
      title: {
        textStyle: { color: ink, fontFamily: font, fontWeight: 600 },
        subtextStyle: { color: muted, fontFamily: font }
      },
      // The palette is pastel, so a pastel fill on a near-white ground needs an
      // outline to hold its shape from the back of a lecture room.
      bar: { itemStyle: { borderColor: line, borderWidth: 1, borderRadius: [4, 4, 0, 0] } },
      line: {
        lineStyle: { width: 2.5 },
        symbolSize: 8,
        symbol: 'circle',
        itemStyle: { borderColor: surface, borderWidth: 1.5 }
      },
      scatter: { itemStyle: { borderColor: surface, borderWidth: 1 } },
      heatmap: { itemStyle: { borderColor: surface, borderWidth: 1 } },
      categoryAxis: axis,
      valueAxis: JSON.parse(JSON.stringify(axis)),
      logAxis: JSON.parse(JSON.stringify(axis)),
      timeAxis: JSON.parse(JSON.stringify(axis)),
      // A legend names the series rather than carrying the reading, so it is
      // set at the size and colour of the axis labels beside it. Chip geometry
      // stays with each chart: liftpath's legend draws the mark shapes
      // themselves and needs a wider box than a colour chip does.
      legend: {
        textStyle: { color: muted, fontFamily: font, fontSize: 14 },
        icon: 'roundRect'
      },
      tooltip: {
        backgroundColor: surface,
        borderColor: line,
        borderWidth: 1,
        textStyle: { color: ink, fontFamily: font, fontSize: 15 },
        axisPointer: { lineStyle: { color: muted }, crossStyle: { color: muted } }
      },
      // Sequential ramp for the member-correlation heatmap: near-white through
      // the category-B tint to the heading blue, so a low correlation reads as
      // absence and a high one as ink.
      visualMap: {
        textStyle: { color: muted, fontFamily: font },
        inRange: { color: [surface, token('--sky'), accent] },
        color: [accent, token('--sky'), surface]
      },
      markPoint: { label: { color: ink, fontFamily: font } }
    };
  }

  // A chart module that calls echarts.init(el) or echarts.init(el, null, ...)
  // gets this theme rather than the ECharts default, so a figure cannot end up
  // in a palette the rest of the deck never uses. A module that names a theme
  // of its own is left alone.
  function makeDefault() {
    var echarts = window.echarts;
    if (!echarts || echarts.__mmacDefaultTheme || typeof echarts.init !== 'function') return;
    var init = echarts.init;
    echarts.__mmacDefaultTheme = true;
    echarts.init = function (dom, theme, opts) {
      return init.call(echarts, dom, (theme === null || theme === undefined || theme === '') ? NAME : theme, opts);
    };
  }

  function register() {
    if (!window.echarts || typeof window.echarts.registerTheme !== 'function') return false;
    window.echarts.registerTheme(NAME, option());
    makeDefault();
    return true;
  }

  // Registered twice on purpose. The first call covers the common case; the
  // second runs once the document is parsed, when the stylesheet has certainly
  // been applied, so the real tokens replace the fallbacks before deck.js
  // mounts any chart. Re-registering a name overwrites it, and no chart has
  // been built yet at either point.
  register();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', register, { once: true });
  }

  window.DeckTheme = { name: NAME, option: option, register: register };
})();
