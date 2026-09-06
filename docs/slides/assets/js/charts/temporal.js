(function () {
  'use strict';

  /* The verdict we report as a negative. Frame saliency across the 64-frame
     window, one pale line per emotion with their mean drawn over the top, and
     the uniform level marked. The whole point is that the curves sit on that
     line: the model's evidence is not localised to any frame. This is a claim
     about locating a frame, not about time; the slide carries that distinction
     in its footnote and notes. Companion to panel A of Figure 5 in the paper.

     Typography, and the same rule in all six chart modules: the body face
     throughout. The mono face belongs to the deck's chrome, to the slide
     number, the timer, the keycaps and code, and the slide content beside
     these charts sets its numbers in the display and body faces too, with
     tabular figures rather than a second family (deck.css, .kpi__value and
     .table). A chart reaching for mono would be the one thing on the stage
     doing it.

     Data: window.DeckData.saliency, written by scripts/build_site_data.py.
     assets/js/charts/spatial.js draws the other half of the same object.
     Interface and colour tokens: build/CONTRACT.md. */

  function css(name, fallback) {
    var value = getComputedStyle(document.documentElement)
      .getPropertyValue(name).trim();
    return value || fallback;
  }

  function family(name, fallback) {
    return css(name, fallback).replace(/"/g, '');
  }

  // See the note in lma.js: naming a theme ECharts has not been given resolves
  // to its default rather than an error, and every colour below is set here
  // anyway, so the chart survives the theme file being absent.
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
  window.DeckCharts.temporal = {
    init: function (el, data) {
      var chart = initChart(el);

      var ink = css('--ink', '#333333');
      var muted = css('--muted', '#6B7280');
      var line = css('--line', '#E3E0DA');
      var surface = css('--surface', '#FFFFFF');
      var accent = css('--accent', '#3D6EA5');
      var sky = css('--sky', '#C4E0F9');
      var em = css('--em', '#B25A3C');
      var body = family('--font-body', 'Outfit, system-ui, sans-serif');

      var emotions = data.emotions || [];
      var curves = data.temporal || [];
      var frames = data.nFrames || (curves[0] || []).length;
      var uniform = data.uniform;

      var index = [];
      var mean = [];
      var low = [];
      var high = [];
      for (var f = 0; f < frames; f++) {
        var total = 0;
        var lo = Infinity;
        var hi = -Infinity;
        for (var c = 0; c < curves.length; c++) {
          var v = curves[c][f];
          total += v;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        index.push(String(f));
        mean.push(total / curves.length);
        low.push(lo);
        high.push(hi);
      }

      // Zero-based, so the flatness is the flatness of the data and not of a
      // cropped axis. The tail fall-off at the end of the window is real and
      // stays visible.
      var peak = Math.max.apply(null, high);
      var top = Math.ceil(peak / 0.005) * 0.005;

      // Short enough to read from the back of the room. What the lines are,
      // what the dashed line marks, and the one number the slide turns on.
      // The rest of the framing lives in the slide's notes.
      var caption = 'Pale lines are the ' + emotions.length + ' emotions, dark '
        + 'line their mean. Dashed line marks uniform 1/' + frames
        + '; class-mean entropy is '
        + data.temporalEntropyMeanPct.toFixed(2) + '% of it.';

      var series = emotions.map(function (name, i) {
        return {
          name: name,
          type: 'line',
          data: curves[i],
          showSymbol: false,
          silent: true,
          lineStyle: { color: sky, width: 1.2, opacity: 0.8 },
          z: 2,
        };
      });

      series.push({
        name: 'mean of the ' + emotions.length + ' emotions',
        type: 'line',
        data: mean,
        showSymbol: false,
        lineStyle: { color: accent, width: 3 },
        z: 5,
        markLine: {
          silent: true,
          symbol: 'none',
          animation: false,
          // ECharts rounds a markLine value to two decimals by default, which
          // would draw the uniform level on the wrong gridline. Precision here
          // is the drawn position, not just the label.
          precision: 6,
          emphasis: { disabled: true },
          data: [{
            yAxis: uniform,
            lineStyle: { color: em, width: 2, type: 'dashed' },
            label: {
              show: true,
              position: 'end',
              distance: 8,
              formatter: 'uniform',
              color: ink,
              fontFamily: body,
              fontSize: 14,
              backgroundColor: surface,
              borderColor: em,
              borderWidth: 1,
              borderRadius: 4,
              padding: [4, 8],
            },
          }],
        },
      });

      chart.setOption({
        animation: false,
        textStyle: { color: ink, fontFamily: body },
        // The right margin holds the reference line's label, which keeps an
        // annotation off the curves it is annotating.
        grid: { left: 8, right: 88, top: 40, bottom: 62, containLabel: true },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line', lineStyle: { color: line } },
          backgroundColor: surface,
          borderColor: line,
          textStyle: { color: ink, fontSize: 15 },
          // Thirteen rows of near-identical numbers would say nothing. The frame
          // gets its mean, the level it is being compared with, and how far the
          // twelve emotions spread around it.
          formatter: function (params) {
            if (!params || !params.length) return '';
            var f = params[0].dataIndex;
            return '<b>frame ' + f + '</b><br>'
              + 'mean <b>' + mean[f].toFixed(4) + '</b>　uniform ' + uniform.toFixed(4)
              + '<br>emotions ' + low[f].toFixed(4) + ' to ' + high[f].toFixed(4);
          },
        },
        xAxis: {
          type: 'category',
          data: index,
          boundaryGap: false,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: line } },
          axisLabel: {
            color: muted,
            fontSize: 14,
            fontFamily: body,
            interval: function (i) { return i % 8 === 0 || i === frames - 1; },
          },
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: top,
          interval: 0.005,
          name: 'share of temporal saliency',
          nameLocation: 'end',
          nameGap: 16,
          nameTextStyle: { color: muted, fontSize: 15, align: 'left' },
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: {
            color: muted,
            fontSize: 14,
            fontFamily: body,
            formatter: function (v) { return v.toFixed(3); },
          },
          splitLine: { lineStyle: { color: line } },
        },
        series: series,
      });

      function refresh() {
        chart.resize();
        var width = captionWidth(el);
        chart.setOption({
          grid: { bottom: 12 + captionRows(caption, width) * 17 },
          graphic: captionGraphic(caption, width, muted, '13px ' + body),
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
