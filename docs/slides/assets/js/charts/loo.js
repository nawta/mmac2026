(function () {
  'use strict';

  // Leave-one-member-out deltas, from assets/data/loo.js.
  //
  // Eleven bars, one per member, every one of them negative: drop any member
  // and the pooled out-of-fold Macro-F1 falls. They are sorted by how much
  // they cost, tinted by inductive-bias family, and the frozen external block
  // sits below a gap of its own because it is a different measurement, the
  // four external members leaving together rather than one at a time.

  var MINUS = '−';     // U+2212, the minus sign the paper prints
  var DELTA = 'Δ';
  var FAMILY_ORDER = ['graph', 'attention', 'hybrid', 'external'];
  var SPACER = ' ';    // an unlabelled category, the gap before the block

  function token(name, fallback) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  // A darker relative of a pastel token. The palette is pale by design, so
  // bars need a border of their own colour to hold an edge on a projector.
  function darken(hex, amount) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var f = 1 - amount;
    return 'rgb(' + Math.round(((n >> 16) & 255) * f) + ','
      + Math.round(((n >> 8) & 255) * f) + ','
      + Math.round((n & 255) * f) + ')';
  }

  // Signed, with the paper's minus sign rather than a hyphen.
  function signed(v, places) {
    var text = Math.abs(v).toFixed(places === undefined ? 2 : places);
    return (v < 0 ? MINUS : '+') + text;
  }

  function familyKey(name) {
    var lower = String(name).toLowerCase();
    for (var i = 0; i < FAMILY_ORDER.length; i++) {
      if (lower.indexOf(FAMILY_ORDER[i]) >= 0) return FAMILY_ORDER[i];
    }
    return 'other';
  }

  // The deck registers an ECharts theme named 'mmac'. When that module has not
  // run, ECharts falls back to its own defaults; every colour here comes from
  // the CSS tokens anyway, so the chart looks the same either way.
  function mount(el) {
    try {
      return window.echarts.init(el, 'mmac', { renderer: 'svg' });
    } catch (err) {
      return window.echarts.init(el, null, { renderer: 'svg' });
    }
  }

  window.DeckCharts = window.DeckCharts || {};
  window.DeckCharts.loo = {
    init: function (el, data) {
      var ink = token('--ink', '#333333');
      var muted = token('--muted', '#6B7280');
      var line = token('--line', '#E3E0DA');
      var surface = token('--surface', '#FFFFFF');
      var peach = token('--peach', '#FFD4C4');
      var sky = token('--sky', '#C4E0F9');
      var mint = token('--mint', '#C4F0DC');
      var lavender = token('--lavender', '#D8C4F0');
      var lemon = token('--lemon', '#F5F0C4');
      var em = token('--em', '#B25A3C');
      var font = token('--font-body', 'system-ui, sans-serif').replace(/"/g, '');

      var familyColor = {
        graph: peach, attention: sky, hybrid: mint, external: lavender, other: lemon
      };

      var chart = mount(el);

      // Biggest loss first, so the top of the chart answers "who carries the
      // most" without the reader doing any sorting.
      var rows = data.members.slice().sort(function (a, b) { return a.delta - b.delta; });
      var block = data.block;

      var categories = rows.map(function (r) { return r.member; });
      categories.push(SPACER, block.member);

      var byName = {};
      rows.concat([block]).forEach(function (r) { byName[r.member] = r; });

      // Family names as the file writes them, ordered graph, attention,
      // hybrid, external.
      var families = [];
      rows.concat([block]).forEach(function (r) {
        if (families.indexOf(r.family) < 0) families.push(r.family);
      });
      families.sort(function (a, b) {
        return FAMILY_ORDER.indexOf(familyKey(a)) - FAMILY_ORDER.indexOf(familyKey(b));
      });

      var deepest = Math.min(block.delta, rows[0].delta);
      var axisMin = Math.floor((deepest - 0.35) * 2) / 2;

      function barItem(record) {
        var fill = familyColor[familyKey(record.family)];
        var style = {
          color: fill,
          borderColor: darken(fill, 0.42),
          borderWidth: 1,
          // Bars run left from zero, so the free end is the one that rounds.
          borderRadius: [3, 0, 0, 3]
        };
        if (record === block) {
          // The block is an aggregate, not a twelfth member, so it is drawn
          // in outline.
          style.borderWidth = 2;
          style.borderType = 'dashed';
          style.opacity = 0.75;
          return {
            value: record.delta,
            itemStyle: style,
            label: { color: em, fontWeight: 700 }
          };
        }
        return { value: record.delta, itemStyle: style };
      }

      function series() {
        return families.map(function (family) {
          return {
            name: family,
            type: 'bar',
            stack: 'delta',
            barWidth: '64%',
            itemStyle: { color: familyColor[familyKey(family)] },
            label: {
              show: true,
              position: 'left',
              distance: 7,
              fontSize: 15,
              fontFamily: font,
              color: ink,
              formatter: function (p) {
                return p.value == null ? '' : signed(p.value) + ' pp';
              }
            },
            data: categories.map(function (name) {
              var record = byName[name];
              return record && record.family === family ? barItem(record) : null;
            })
          };
        });
      }

      function tooltip(params) {
        if (!params || !params.length) return '';
        var record = byName[params[0].axisValue];
        if (!record) return '';
        var lead = record === block
          ? 'removed as one block, ' + signed(record.delta) + ' pp'
          : signed(record.delta) + ' pp when this member leaves the logit mean';
        return '<div style="font-weight:700;margin-bottom:4px">' + record.member + '</div>'
          + record.family + '<br/>' + lead + '<br/>'
          + 'base ' + data.base.toFixed(2) + '% pooled out-of-fold'
          + '<div style="color:' + muted + ';font-size:13px;margin-top:5px;max-width:280px;'
          + 'white-space:normal">' + data.note + '</div>';
      }

      function option() {
        return {
          textStyle: { fontFamily: font, color: ink },
          animationDuration: 620,
          animationEasing: 'cubicOut',
          grid: { left: 8, right: 26, top: 42, bottom: 30, containLabel: true },
          legend: {
            top: 2,
            left: 'center',
            itemGap: 20,
            itemWidth: 16,
            itemHeight: 11,
            icon: 'roundRect',
            selectedMode: false,
            textStyle: { fontSize: 14, color: muted, fontFamily: font },
            data: families
          },
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            backgroundColor: surface,
            borderColor: line,
            borderWidth: 1,
            padding: [8, 11],
            textStyle: { color: ink, fontSize: 15, fontFamily: font },
            formatter: tooltip
          },
          xAxis: {
            type: 'value',
            min: axisMin,
            max: 0,
            interval: 0.5,
            name: DELTA + ' pooled out-of-fold Macro-F1 (pp), base '
              + data.base.toFixed(2) + '%',
            nameLocation: 'middle',
            nameGap: 30,
            nameTextStyle: { fontSize: 15, color: muted, fontFamily: font },
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
              fontSize: 14, color: muted, fontFamily: font,
              formatter: function (v) { return v === 0 ? '0' : signed(v, 1); }
            },
            splitLine: { show: true, lineStyle: { color: line } }
          },
          yAxis: {
            type: 'category',
            data: categories,
            inverse: true,
            axisLine: { show: false, onZero: false },
            axisTick: { show: false },
            axisLabel: {
              interval: 0,
              fontSize: 15, color: ink, fontFamily: font, margin: 10,
              formatter: function (value) {
                return value === block.member ? '{block|' + value + '}' : value;
              },
              rich: { block: { fontSize: 15, fontWeight: 700, color: em, fontFamily: font } }
            }
          },
          series: series().map(function (s, i) {
            if (i > 0) return s;
            // The zero rule belongs to the chart, not to one family, so the
            // first series carries it.
            s.markLine = {
              silent: true,
              symbol: 'none',
              animation: false,
              data: [{
                xAxis: 0,
                lineStyle: { color: ink, width: 1.5, type: 'solid' },
                label: { show: false }
              }]
            };
            return s;
          })
        };
      }

      function draw(replay) {
        chart.setOption(option(), replay ? { replaceMerge: ['series'] } : undefined);
      }

      draw(false);

      return {
        chart: chart,
        resize: function () { if (el.clientWidth) chart.resize(); },
        dispose: function () { chart.dispose(); },
        onEnter: function () {
          if (!el.clientWidth) return;
          chart.resize();
          draw(true);
        },
        onLeave: function () {}
      };
    }
  };
})();
