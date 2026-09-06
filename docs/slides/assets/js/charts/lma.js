(function () {
  'use strict';

  /* Verdict 3 of the explainability suite, and the load-bearing one: does the
     saliency the model puts on each body region line up with the rule-based
     Laban attributes for that emotion? One bar group per emotion for the
     explained member and for the submitted 11-way ensemble, with the
     classical-kinematics control beside them. The two aggregate levels are
     reference lines because the gap between them is the finding; the bars show
     how that aggregate is spread across emotions. Companion to panel A of
     Figure 6 in the paper.

     Typography, and the same rule in all six chart modules: the body face
     throughout. The mono face belongs to the deck's chrome, to the slide
     number, the timer, the keycaps and code, and the slide content beside
     these charts sets its numbers in the display and body faces too, with
     tabular figures rather than a second family (deck.css, .kpi__value and
     .table). A chart reaching for mono would be the one thing on the stage
     doing it.

     Data: window.DeckData.lma, written by scripts/build_site_data.py.
     Interface and colour tokens: build/CONTRACT.md. */

  function css(name, fallback) {
    var value = getComputedStyle(document.documentElement)
      .getPropertyValue(name).trim();
    return value || fallback;
  }

  function family(name, fallback) {
    return css(name, fallback).replace(/"/g, '');
  }

  // The paper's minus sign, not the ASCII hyphen toFixed hands back. Every
  // number this module prints goes through signed() or fixed(), so the axis
  // and the annotations agree on the glyph.
  var MINUS = '−';   // U+2212

  // Sign first, so a negative correlation reads as negative at a glance.
  function signed(value, digits) {
    var magnitude = Math.abs(value).toFixed(digits);
    if (value > 0) return '+' + magnitude;
    if (value < 0) return MINUS + magnitude;
    return magnitude;
  }

  // The axis wants the sign only where there is one, so its ticks read 0.4 and
  // −0.4 rather than +0.4 and −0.4.
  function fixed(value, digits) {
    if (value < 0) return MINUS + Math.abs(value).toFixed(digits);
    return value.toFixed(digits);
  }

  // Measured rather than guessed, so the three columns of the key line up in
  // whatever the reader's machine resolves --font-body to.
  function textWidth(text, font) {
    var canvas = textWidth.canvas || (textWidth.canvas = document.createElement('canvas'));
    var context = canvas.getContext('2d');
    context.font = font;
    return context.measureText(text).width;
  }

  // assets/js/echarts-theme.js registers the deck theme under the name 'mmac'.
  // ECharts resolves a theme name it does not know to undefined and draws with
  // its own default, so naming it is safe even before that file exists; the
  // catch covers the case where it exists but is malformed. Every colour below
  // is set explicitly either way, so the chart reads the same with or without
  // the theme.
  function initChart(el) {
    var ec = window.echarts;
    try {
      return ec.init(el, 'mmac', { renderer: 'svg' });
    } catch (error) {
      var stale = ec.getInstanceByDom && ec.getInstanceByDom(el);
      if (stale) stale.dispose();
      return ec.init(el, null, { renderer: 'svg' });
    }
  }

  // The caption belongs to the chart, not to the slide around it, so a reader
  // who meets the figure on its own still knows what the bars are and how
  // coarse they can be. Width is re-read on every resize so the text wraps
  // instead of running off the canvas.
  function captionWidth(el) {
    return Math.max(240, (el.clientWidth || 900) - 24);
  }

  // How many lines the caption will wrap to. Estimated from the character
  // count rather than measured, which is enough to reserve the right amount of
  // room below the axis. 7.3px per character is the average this caption
  // actually gets once the break lands on word boundaries, and rounding up
  // means a wrong guess leaves a gap rather than an overlap.
  function captionRows(text, width) {
    return Math.max(1, Math.ceil((text.length * 7.3) / width));
  }

  function captionGraphic(text, width, fill, font) {
    return [{
      id: 'caption',
      type: 'text',
      left: 10,
      bottom: 6,
      silent: true,
      style: {
        text: text,
        fill: fill,
        font: font,
        lineHeight: 17,
        width: width,
        overflow: 'break',
      },
    }];
  }

  window.DeckCharts = window.DeckCharts || {};
  window.DeckCharts.lma = {
    init: function (el, data) {
      var chart = initChart(el);

      var ink = css('--ink', '#333333');
      var muted = css('--muted', '#6B7280');
      var line = css('--line', '#E3E0DA');
      var surface = css('--surface', '#FFFFFF');
      var accent = css('--accent', '#3D6EA5');
      var sky = css('--sky', '#C4E0F9');
      var lavender = css('--lavender', '#D8C4F0');
      var body = family('--font-body', 'Outfit, system-ui, sans-serif');

      var rows = data.perEmotion || [];
      var head = data.headline || {};
      var rho = 'ρ';

      // Short enough to read from the back of the room. The two dashed lines
      // carry their own aggregate values, so the caption only has to say what
      // the bars are and that the lines are the overall levels.
      var caption = 'Bars are per-emotion Spearman ' + rho + ' between saliency '
        + 'and Laban attributes; grey is the classical-kinematics control. '
        + 'Dashed lines mark the overall levels.';

      // The two aggregate levels, sorted the way they stack in the plot so the
      // key below runs in the same order as the lines it names.
      var levels = [
        {
          value: head.memberRho,
          colour: accent,
          name: 'explained member',
          number: rho + ' = ' + signed(head.memberRho, 3),
        },
        {
          value: head.kinematicsRho,
          colour: muted,
          name: 'classical kinematics',
          number: rho + ' = ' + signed(head.kinematicsRho, 3),
        },
      ].sort(function (a, b) { return b.value - a.value; });

      function reference(level) {
        return {
          yAxis: level.value,
          lineStyle: { color: level.colour, width: 2, type: 'dashed' },
          label: { show: false },
        };
      }

      // Where the two levels are named. Their labels used to sit on the lines
      // themselves, which put an opaque box over the right quarter of the plot
      // and cut shame, guilt, gratitude and pride in half. There is nowhere
      // inside this plot for a label this long: the bars all start at zero, so
      // every band above the axis is crossed by one. The key goes above the
      // plot instead, under the legend, where it covers nothing and still puts
      // the two numbers in a column of their own, which is the comparison the
      // slide turns on. The dashed sample carries the colour, so each row
      // still points at its own line.
      var KEY_SWATCH = 26;   // length of the dashed sample
      var KEY_GAP = 9;       // between sample, name and number
      var KEY_SPAN = 26;     // between the two levels when they share a row
      var KEY_ROW = 21;      // one row of the key
      var KEY_TOP = 27;      // clear of the legend above it
      var KEY_NAME = '14px ' + body;
      var KEY_NUMBER = '700 15px ' + body;
      // What the y axis writes above its own top left corner, in the sizes the
      // axis below is given: the widest tick, then the axis name beside it.
      // The key stays right of this, whichever shape it takes.
      var KEY_GUARD = 8 + textWidth(fixed(-1, 1), '14px ' + body) + 8
        + textWidth('Spearman ' + rho, '15px ' + body) + 16;

      function keyRow(level, i, left, top, nameColumn) {
        return [
          {
            id: 'key-rule-' + i,
            type: 'line',
            silent: true,
            left: left,
            top: top + 9,
            shape: { x1: 0, y1: 0, x2: KEY_SWATCH, y2: 0 },
            style: { stroke: level.colour, lineWidth: 2, lineDash: [5, 4] },
          },
          {
            id: 'key-name-' + i,
            type: 'text',
            silent: true,
            left: left + KEY_SWATCH + KEY_GAP,
            top: top,
            style: { text: level.name, fill: ink, font: KEY_NAME },
          },
          {
            id: 'key-number-' + i,
            type: 'text',
            silent: true,
            // A shade larger and bolder than the name it belongs to: this is
            // the pair of numbers the slide is about.
            left: left + KEY_SWATCH + KEY_GAP + nameColumn + KEY_GAP,
            top: top - 1,
            style: { text: level.number, fill: ink, font: KEY_NUMBER },
          },
        ];
      }

      // One row if the two levels fit on one clear of the axis name, which
      // sets the two numbers side by side and reads as a second row of the
      // legend. Two rows when the container is too narrow for that, stacked in
      // the order the lines stack and with the names and the numbers each in a
      // column of their own. At the width this slide gives the chart it takes
      // the two-row shape.
      function keyLayout(width) {
        var measured = levels.map(function (level) {
          return {
            level: level,
            name: textWidth(level.name, KEY_NAME),
            number: textWidth(level.number, KEY_NUMBER),
          };
        });
        var span = measured.map(function (m) {
          return KEY_SWATCH + KEY_GAP + m.name + KEY_GAP + m.number;
        });
        var inline = span.reduce(function (total, one) { return total + one; }, 0)
          + KEY_SPAN * (span.length - 1);

        var items = [];
        var rows = 1;
        if (inline <= width - 10 - KEY_GUARD) {
          var x = width - 10 - inline;
          measured.forEach(function (m, i) {
            items = items.concat(keyRow(m.level, i, x, KEY_TOP, m.name));
            x += span[i] + KEY_SPAN;
          });
        } else {
          rows = measured.length;
          var nameColumn = 0;
          var numberColumn = 0;
          measured.forEach(function (m) {
            nameColumn = Math.max(nameColumn, m.name);
            numberColumn = Math.max(numberColumn, m.number);
          });
          var block = KEY_SWATCH + KEY_GAP + nameColumn + KEY_GAP + numberColumn;
          var left = Math.max(8, width - 10 - block);
          measured.forEach(function (m, i) {
            items = items.concat(
              keyRow(m.level, i, left, KEY_TOP + i * KEY_ROW, nameColumn));
          });
        }
        return { items: items, top: KEY_TOP + rows * KEY_ROW + 8 };
      }

      chart.setOption({
        animation: false,
        textStyle: { color: ink, fontFamily: body },
        // The top margin carries the legend and, under it, the key naming the
        // two reference lines. refresh() re-reads the height on every resize,
        // since the key stacks when the container is too narrow for one row.
        grid: {
          left: 8,
          right: 16,
          top: keyLayout(chart.getWidth()).top,
          bottom: 58,
          containLabel: true,
        },
        legend: {
          top: 4,
          left: 'center',
          itemGap: 20,
          itemWidth: 14,
          itemHeight: 11,
          icon: 'roundRect',
          textStyle: { color: muted, fontSize: 14, fontFamily: body },
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          backgroundColor: surface,
          borderColor: line,
          textStyle: { color: ink, fontSize: 15 },
          formatter: function (params) {
            if (!params || !params.length) return '';
            var lines = params.map(function (p) {
              return p.marker + p.seriesName + '  <b>' + signed(p.value, 2) + '</b>';
            });
            return '<b>' + params[0].name + '</b><br>' + lines.join('<br>');
          },
        },
        xAxis: {
          type: 'category',
          data: rows.map(function (r) { return r.emotion; }),
          axisTick: { show: false },
          axisLine: { lineStyle: { color: line } },
          axisLabel: {
            interval: 0,
            margin: 12,
            color: ink,
            fontSize: 14,
            fontFamily: body,
          },
        },
        yAxis: {
          type: 'value',
          // The grid the data can actually land on: four regions ranked against
          // four attribute scores gives steps of 0.2 and nothing between them.
          min: -1,
          max: 1,
          interval: 0.2,
          name: 'Spearman ' + rho,
          nameLocation: 'end',
          nameGap: 16,
          nameTextStyle: { color: muted, fontSize: 15, align: 'left' },
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: {
            color: muted,
            fontSize: 14,
            fontFamily: body,
            formatter: function (v) { return fixed(v, 1); },
          },
          splitLine: { lineStyle: { color: line } },
        },
        series: [
          {
            name: 'explained member',
            type: 'bar',
            data: rows.map(function (r) { return r.member; }),
            itemStyle: { color: sky, borderRadius: 3 },
            markLine: {
              silent: true,
              symbol: 'none',
              animation: false,
              // ECharts rounds a markLine value to two decimals by default,
              // which would draw +0.033 off its own level. Precision here is
              // the drawn position, not just the label.
              precision: 6,
              emphasis: { disabled: true },
              data: [{
                yAxis: 0,
                lineStyle: { color: ink, width: 1.5, type: 'solid' },
                label: { show: false },
              }].concat(levels.map(reference)),
            },
          },
          {
            name: 'submitted ensemble',
            type: 'bar',
            data: rows.map(function (r) { return r.ensemble; }),
            itemStyle: { color: lavender, borderRadius: 3 },
          },
          {
            name: 'classical kinematics',
            type: 'bar',
            data: rows.map(function (r) { return r.kinematics; }),
            itemStyle: {
              color: line,
              borderColor: muted,
              borderWidth: 1,
              borderRadius: 3,
            },
          },
        ],
      });

      function refresh() {
        chart.resize();
        var width = captionWidth(el);
        // Twelve emotion names read best flat, and run into each other once a
        // group is narrower than the longest of them.
        var slot = (width - 60) / Math.max(1, rows.length);
        var key = keyLayout(chart.getWidth());
        chart.setOption({
          grid: { top: key.top, bottom: 12 + captionRows(caption, width) * 17 },
          xAxis: { axisLabel: { rotate: slot < 74 ? 30 : 0 } },
          graphic: key.items
            .concat(captionGraphic(caption, width, muted, '13px ' + body)),
        });
      }
      refresh();

      return {
        chart: chart,
        resize: refresh,
        dispose: function () { chart.dispose(); },
        onEnter: refresh,
        onLeave: function () {},
      };
    },
  };
})();
