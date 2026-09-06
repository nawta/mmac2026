(function () {
  'use strict';

  // Macro-F1 at the four stages of the lift path, from assets/data/liftpath.js.
  //
  // Every bar carries three marks that each answer a different question, so the
  // chart gives each one its own place. Dots inside the bar are the individual
  // folds. The capped whisker on the bar centre is the spread across those
  // folds. The blue rule just outside the bar belongs to the pooled
  // out-of-fold score, a second convention on the same system with its own
  // bootstrap interval, and the chart keeps it visibly apart from the per-fold
  // mean so the two are never read as one number.
  //
  // Typography, and the same rule in all six chart modules: the body face
  // throughout. The mono face belongs to the deck's chrome, to the slide
  // number, the timer, the keycaps and code, and the slide content beside
  // these charts sets its numbers in the display and body faces too, with
  // tabular figures rather than a second family (deck.css, .kpi__value and
  // .table). A chart reaching for mono would be the one thing on the stage
  // doing it.

  var PM = '±';        // plus-minus
  var TO = '–';        // en dash, used between two ends of a range

  function token(name, fallback) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  // A darker relative of a pastel token. The palette is pale by design, so
  // borders and marks need this to hold an edge on a projector.
  function darken(hex, amount) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var f = 1 - amount;
    return 'rgb(' + Math.round(((n >> 16) & 255) * f) + ','
      + Math.round(((n >> 8) & 255) * f) + ','
      + Math.round((n & 255) * f) + ')';
  }

  function f2(v) { return v.toFixed(2); }

  function grouped(n) { return n.toLocaleString('en-US'); }

  // The deck registers an ECharts theme named 'mmac'. When that module has not
  // run, ECharts falls back to its own defaults; every colour here is set from
  // the CSS tokens anyway, so the chart looks the same either way.
  function mount(el) {
    try {
      return window.echarts.init(el, 'mmac', { renderer: 'svg' });
    } catch (err) {
      return window.echarts.init(el, null, { renderer: 'svg' });
    }
  }

  window.DeckCharts = window.DeckCharts || {};
  window.DeckCharts.liftpath = {
    init: function (el, data) {
      var stages = data.stages;
      var last = stages.length - 1;

      var ink = token('--ink', '#333333');
      var muted = token('--muted', '#6B7280');
      var line = token('--line', '#E3E0DA');
      var surface = token('--surface', '#FFFFFF');
      var peach = token('--peach', '#FFD4C4');
      var accent = token('--accent', '#3D6EA5');
      var em = token('--em', '#B25A3C');
      var font = token('--font-body', 'system-ui, sans-serif').replace(/"/g, '');

      var chart = mount(el);

      var FOLDS = 'per-fold score';
      var SPREAD = 'mean ' + PM + ' SD';
      var POOLED = 'pooled out-of-fold, 95% CI';

      var labels = stages.map(function (s) { return s.label; });
      // Room above the highest mark, whisker or fold alike, for its label.
      var ceiling = Math.max.apply(null, stages.map(function (s) {
        return Math.max.apply(null, [s.mean + s.sd].concat(s.perFold));
      }));
      var axisMax = Math.ceil((ceiling + 4) / 10) * 10;

      // One dot per fold per stage. The dots are marks only: the tooltip
      // reports the stage summary, so no single fold score is ever printed.
      var foldItems = [];
      stages.forEach(function (s, i) {
        var n = s.perFold.length;
        s.perFold.forEach(function (v, k) { foldItems.push([i, v, k, n]); });
      });

      var barStyle = stages.map(function (s, i) {
        if (i === 0) {
          // The reproduced baseline is not one of ours, so it stays grey and
          // the coloured bars read as the ensemble path.
          return {
            color: line, borderColor: darken(line, 0.28), borderWidth: 1,
            borderRadius: [3, 3, 0, 0]
          };
        }
        var strength = i === last ? 1 : 0.45 + 0.2 * i;
        return {
          color: peach,
          opacity: strength,
          borderColor: darken(peach, 0.4),
          borderWidth: i === last ? 2 : 1,
          borderRadius: [3, 3, 0, 0]
        };
      });

      function upArrow(x, y, w, h, color) {
        return {
          type: 'polygon', silent: true,
          shape: { points: [[x, y], [x - w, y + h], [x + w, y + h]] },
          style: { fill: color }
        };
      }

      function downArrow(x, y, w, h, color) {
        return {
          type: 'polygon', silent: true,
          shape: { points: [[x, y], [x - w, y - h], [x + w, y - h]] },
          style: { fill: color }
        };
      }

      // Ten dots spread evenly across the bar. The spread is a fraction of the
      // category band, so it survives a resize.
      function renderFold(params, api) {
        var band = api.size([1, 0])[0];
        var n = api.value(3);
        var k = api.value(2);
        var p = api.coord([api.value(0), api.value(1)]);
        var dx = n > 1 ? (-0.5 + (k + 0.5) / n) * band * 0.48 : 0;
        return {
          type: 'circle', silent: true,
          shape: { cx: p[0] + dx, cy: p[1], r: 4 },
          style: { fill: surface, stroke: darken(muted, 0.05), lineWidth: 1.4, opacity: 0.9 },
          enterFrom: { style: { opacity: 0 } }
        };
      }

      function renderSpread(params, api) {
        var i = api.value(0);
        var mean = api.value(1);
        var sd = api.value(2);
        var band = api.size([1, 0])[0];
        var x = api.coord([i, mean])[0];
        var hi = api.coord([i, mean + sd])[1];
        var lo = api.coord([i, mean - sd])[1];
        // A fold can land above the whisker, so the label clears the higher
        // of the two rather than sitting on top of a dot.
        var clear = Math.min(hi, api.coord([i, api.value(3)])[1]);
        var cap = band * 0.09;
        var stroke = { stroke: ink, lineWidth: 2, opacity: 0.85, fill: 'none' };
        return {
          type: 'group',
          enterFrom: { style: { opacity: 0 } },
          children: [
            { type: 'line', silent: true, shape: { x1: x, y1: hi, x2: x, y2: lo }, style: stroke },
            { type: 'line', silent: true, shape: { x1: x - cap, y1: hi, x2: x + cap, y2: hi }, style: stroke },
            { type: 'line', silent: true, shape: { x1: x - cap, y1: lo, x2: x + cap, y2: lo }, style: stroke },
            {
              type: 'text', silent: true,
              style: {
                x: x, y: clear - 11, text: f2(mean) + ' ' + PM + ' ' + f2(sd),
                fill: i === last ? em : ink, fontSize: 17, fontFamily: font,
                fontWeight: i === last ? 700 : 400,
                align: 'center', verticalAlign: 'bottom'
              }
            }
          ]
        };
      }

      // Bootstrap interval on the pooled out-of-fold score, drawn in blue and
      // offset off the bar so it cannot be mistaken for the fold spread.
      function renderPooled(params, api) {
        var i = api.value(0);
        var band = api.size([1, 0])[0];
        var x = api.coord([i, api.value(1)])[0] - band * 0.4;
        var mid = api.coord([i, api.value(1)])[1];
        var hi = api.coord([i, api.value(3)])[1];
        var lo = api.coord([i, api.value(2)])[1];
        var cap = band * 0.055;
        var stroke = { stroke: accent, lineWidth: 2.4, fill: 'none' };
        var r = 6;
        return {
          type: 'group',
          enterFrom: { style: { opacity: 0 } },
          children: [
            { type: 'line', silent: true, shape: { x1: x, y1: hi, x2: x, y2: lo }, style: stroke },
            { type: 'line', silent: true, shape: { x1: x - cap, y1: hi, x2: x + cap, y2: hi }, style: stroke },
            { type: 'line', silent: true, shape: { x1: x - cap, y1: lo, x2: x + cap, y2: lo }, style: stroke },
            {
              type: 'polygon', silent: true,
              shape: { points: [[x, mid - r], [x + r, mid], [x, mid + r], [x - r, mid]] },
              style: { fill: accent }
            }
          ]
        };
      }

      // The whole point of the slide: how far the submitted ensemble sits
      // above the reproduced baseline. The arrow is pinned to the last bar.
      function renderGain(params, api) {
        var i = api.value(0);
        var band = api.size([1, 0])[0];
        var x = api.coord([i, api.value(1)])[0] + band * 0.36;
        var lo = api.coord([i, api.value(1)])[1];
        var hi = api.coord([i, api.value(2)])[1];
        return {
          type: 'group',
          enterFrom: { style: { opacity: 0 } },
          children: [
            { type: 'line', silent: true, shape: { x1: x, y1: hi + 5, x2: x, y2: lo - 5 }, style: { stroke: em, lineWidth: 2, fill: 'none' } },
            upArrow(x, hi, 5, 9, em),
            downArrow(x, lo, 5, 9, em),
            {
              type: 'text', silent: true,
              style: {
                x: x - 9, y: (hi + lo) / 2,
                text: '+' + f2(data.gainPp) + ' pp\n+' + data.gainRelPct + '% rel.',
                fill: em, fontSize: 18, fontWeight: 700, fontFamily: font, lineHeight: 21,
                align: 'right', verticalAlign: 'middle',
                backgroundColor: 'rgba(255,255,255,0.84)', padding: [3, 6], borderRadius: 4
              }
            }
          ]
        };
      }

      function tooltip(params) {
        if (!params || !params.length) return '';
        var i = labels.indexOf(params[0].axisValue);
        if (i < 0) return '';
        var s = stages[i];
        var out = '<div style="font-weight:700;margin-bottom:4px">' + s.key + '</div>';
        out += 'per-fold mean <b>' + f2(s.mean) + ' ' + PM + ' ' + f2(s.sd) + '%</b><br/>';
        if (s.perFold.length) {
          var lo = Math.min.apply(null, s.perFold);
          var hi = Math.max.apply(null, s.perFold);
          out += s.perFold.length + ' folds, ' + f2(lo) + ' ' + TO + ' ' + f2(hi) + '%<br/>';
        }
        out += 'pooled out-of-fold ' + f2(s.pooled) + '%, n = ' + grouped(data.nOof) + '<br/>';
        out += 'bootstrap 95% CI [' + f2(s.ci[0]) + ', ' + f2(s.ci[1]) + ']';
        out += '<div style="color:' + muted + ';font-size:13px;margin-top:5px">'
          + '10-fold leave-performers-out cross-validation</div>';
        return out;
      }

      function option() {
        return {
          textStyle: { fontFamily: font, color: ink },
          animationDuration: 620,
          animationEasing: 'cubicOut',
          grid: { left: 34, right: 12, top: 52, bottom: 6, containLabel: true },
          legend: {
            top: 2, right: 6, itemGap: 20, selectedMode: false,
            textStyle: { fontSize: 14, color: muted, fontFamily: font },
            data: [
              { name: FOLDS, icon: 'circle' },
              { name: SPREAD, icon: 'path://M0,0 L12,0 L12,3 L7.5,3 L7.5,17 L12,17 L12,20 L0,20 L0,17 L4.5,17 L4.5,3 L0,3 Z' },
              { name: POOLED, icon: 'diamond' }
            ]
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
            type: 'category',
            data: labels,
            axisTick: { show: false },
            axisLine: { lineStyle: { color: line } },
            axisLabel: {
              interval: 0,
              fontSize: 14, lineHeight: 18, color: ink, fontFamily: font, margin: 12,
              formatter: function (value, index) {
                if (index !== last) return value;
                // Rich text is parsed line by line, so each line gets its own tag.
                return value.split('\n').map(function (row) { return '{hi|' + row + '}'; }).join('\n');
              },
              rich: { hi: { fontSize: 14, lineHeight: 18, fontWeight: 700, color: em, fontFamily: font } }
            }
          },
          yAxis: {
            type: 'value',
            min: 0,
            max: axisMax,
            interval: 10,
            name: 'Macro-F1 (%)',
            nameLocation: 'middle',
            nameRotate: 90,
            nameGap: 44,
            nameTextStyle: { fontSize: 15, color: muted, fontFamily: font },
            axisLabel: { fontSize: 14, color: muted, fontFamily: font },
            splitLine: { show: true, lineStyle: { color: line } }
          },
          series: [
            {
              id: 'bars',
              type: 'bar',
              barWidth: '58%',
              data: stages.map(function (s, i) { return { value: s.mean, itemStyle: barStyle[i] }; }),
              markLine: {
                silent: true,
                symbol: 'none',
                animation: false,
                data: [
                  {
                    yAxis: data.chance,
                    lineStyle: { color: muted, type: 'dashed', width: 1.5 },
                    label: {
                      formatter: 'chance ' + data.chance + '%',
                      position: 'insideStartTop', color: muted, fontSize: 14, fontFamily: font
                    }
                  },
                  {
                    yAxis: stages[0].mean,
                    lineStyle: { color: em, type: 'dashed', width: 1.5, opacity: 0.75 },
                    label: {
                      formatter: 'reproduced baseline',
                      // Under the line, not over it. Above the line at mid-width
                      // the label lands on the best-single bar and its whisker;
                      // the strip just below the line is empty across every
                      // stage, since no fold sits that low from the second bar on.
                      position: 'insideMiddleBottom', distance: 6,
                      color: em, fontSize: 14, fontFamily: font,
                      // The same translucent plate the gain annotation uses, so
                      // the words hold their edge over a bar fill.
                      backgroundColor: 'rgba(255,255,255,0.84)',
                      padding: [2, 6], borderRadius: 4
                    }
                  }
                ]
              }
            },
            {
              name: FOLDS,
              type: 'custom',
              z: 3,
              itemStyle: { color: muted },
              animationDelay: 380,
              renderItem: renderFold,
              encode: { x: 0, y: 1 },
              data: foldItems
            },
            {
              name: SPREAD,
              type: 'custom',
              z: 4,
              itemStyle: { color: ink },
              animationDelay: 430,
              renderItem: renderSpread,
              encode: { x: 0, y: 1 },
              data: stages.map(function (s, i) {
                var ceiling = s.perFold.length ? Math.max.apply(null, s.perFold) : s.mean + s.sd;
                return [i, s.mean, s.sd, ceiling];
              })
            },
            {
              name: POOLED,
              type: 'custom',
              z: 4,
              itemStyle: { color: accent },
              animationDelay: 480,
              renderItem: renderPooled,
              encode: { x: 0, y: 1 },
              data: stages.map(function (s, i) { return [i, s.pooled, s.ci[0], s.ci[1]]; })
            },
            {
              type: 'custom',
              z: 5,
              silent: true,
              animationDelay: 560,
              renderItem: renderGain,
              encode: { x: 0, y: 1 },
              data: [[last, stages[0].mean, stages[last].mean]]
            }
          ]
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
