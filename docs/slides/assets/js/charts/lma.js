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

  // Sign first, so a negative correlation reads as negative at a glance. The
  // real minus, not a hyphen, because every number here is set in mono.
  function signed(value, digits) {
    var magnitude = Math.abs(value).toFixed(digits);
    if (value > 0) return '+' + magnitude;
    if (value < 0) return '−' + magnitude;
    return magnitude;
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
      var mono = family('--font-mono', 'PlemolJP, ui-monospace, Menlo, monospace');

      var rows = data.perEmotion || [];
      var head = data.headline || {};
      var rho = 'ρ';

      // Short enough to read from the back of the room. The two dashed lines
      // carry their own aggregate values, so the caption only has to say what
      // the bars are and that the lines are the overall levels.
      var caption = 'Bars are per-emotion Spearman ' + rho + ' between saliency '
        + 'and Laban attributes; grey is the classical-kinematics control. '
        + 'Dashed lines mark the overall levels.';

      // Both aggregates sit inside the same plot as the bars they summarise, in
      // a filled box so the label stays legible wherever a bar runs under it.
      function level(value, label, colour) {
        return {
          yAxis: value,
          lineStyle: { color: colour, width: 2, type: 'dashed' },
          label: {
            show: true,
            position: 'insideEndTop',
            distance: 6,
            formatter: label,
            color: ink,
            fontFamily: mono,
            fontSize: 14,
            backgroundColor: surface,
            borderColor: colour,
            borderWidth: 1,
            borderRadius: 4,
            padding: [4, 8],
          },
        };
      }

      chart.setOption({
        animation: false,
        textStyle: { color: ink, fontFamily: body },
        grid: { left: 8, right: 16, top: 58, bottom: 58, containLabel: true },
        legend: {
          top: 4,
          left: 'center',
          itemGap: 22,
          itemWidth: 14,
          itemHeight: 14,
          icon: 'roundRect',
          textStyle: { color: ink, fontSize: 15, fontFamily: body },
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
            fontFamily: mono,
            formatter: function (v) { return v.toFixed(1); },
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
              data: [
                {
                  yAxis: 0,
                  lineStyle: { color: ink, width: 1.5, type: 'solid' },
                  label: { show: false },
                },
                level(
                  head.memberRho,
                  'explained member  ' + rho + ' = ' + signed(head.memberRho, 3),
                  accent
                ),
                level(
                  head.kinematicsRho,
                  'classical kinematics  ' + rho + ' = ' + signed(head.kinematicsRho, 3),
                  muted
                ),
              ],
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
        chart.setOption({
          grid: { bottom: 12 + captionRows(caption, width) * 17 },
          xAxis: { axisLabel: { rotate: slot < 74 ? 30 : 0 } },
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
