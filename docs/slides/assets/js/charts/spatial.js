(function () {
  'use strict';

  /* The contrast that makes the temporal null mean something. Where frame
     saliency is flat, spatial saliency is not: a few joints take a large share
     of it and the rest take very little. Joints run along the axis ordered by
     the class mean, so the head and neck chain leads and every emotion can be
     read against the same order. The names above the chart switch between the
     class mean and a single emotion. Companion to panel B of Figure 5 in the
     paper.

     Typography, and the same rule in all six chart modules: the body face
     throughout. The mono face belongs to the deck's chrome, to the slide
     number, the timer, the keycaps and code, and the slide content beside
     these charts sets its numbers in the display and body faces too, with
     tabular figures rather than a second family (deck.css, .kpi__value and
     .table). A chart reaching for mono would be the one thing on the stage
     doing it.

     Data: window.DeckData.saliency, written by scripts/build_site_data.py.
     assets/js/charts/temporal.js draws the other half of the same object.
     Interface and colour tokens: build/CONTRACT.md. */

  var MEAN = 'class mean';

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

  // Skeleton joint names carry their own region, so colouring the tick labels
  // groups the axis without spending a second legend on it.
  function regionOf(joint) {
    if (/^(Head|Neck|Neck1)$/.test(joint)) return 'head';
    if (/(Shoulder|Arm|Hand)/.test(joint)) return 'arm';
    if (/(Leg|Foot|Toe)/.test(joint)) return 'leg';
    return 'torso';
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
  window.DeckCharts.spatial = {
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
      var joints = data.joints || [];
      var rows = data.spatial || [];

      var classMean = joints.map(function (_, j) {
        var total = 0;
        for (var i = 0; i < rows.length; i++) total += rows[i][j];
        return total / rows.length;
      });

      // Ordered by the class mean and then held fixed, so switching emotions
      // moves the bars and never the axis. Head, Neck and Neck1 come out at the
      // front on their own; nothing here puts them there by hand.
      var order = joints.map(function (_, j) { return j; }).sort(function (a, b) {
        return classMean[b] - classMean[a];
      });
      var names = order.map(function (j) { return joints[j]; });
      var byOrder = function (values) {
        return order.map(function (j) { return values[j]; });
      };

      // One scale for every emotion, taken over all of them, so a switch is a
      // comparison rather than a rescale.
      var peak = 0;
      rows.forEach(function (row) {
        row.forEach(function (v) { if (v > peak) peak = v; });
      });
      var top = Math.ceil(peak / 0.02) * 0.02;
      var uniform = joints.length ? 1 / joints.length : 0;

      var lead = names[0];
      var leadCount = 0;
      rows.forEach(function (row) {
        var best = 0;
        for (var j = 1; j < row.length; j++) if (row[j] > row[best]) best = j;
        if (joints[best] === lead) leadCount++;
      });
      var leadLine = leadCount === rows.length
        ? lead + ' leads in all ' + rows.length + ' emotions. '
        : lead + ' leads in ' + leadCount + ' of ' + rows.length + ' emotions. ';

      // Short enough to read from the back of the room: what the bars are,
      // the one thing to notice, and what the dashed line marks. The legend
      // above the chart still switches between the class mean and one emotion.
      // The fraction sits before the wrap point at this chart's width, so the
      // line never breaks in the middle of it.
      var caption = 'Share of spatial saliency per joint. ' + leadLine
        + 'Dashed line marks 1/' + joints.length + ', an even spread.';

      // Each series carries its own copy: only one is ever visible, and the
      // reference line has to stay with whichever that is.
      function uniformLine() {
        return {
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
        };
      }

      function bars(name, values) {
        return {
          name: name,
          type: 'bar',
          data: values,
          barCategoryGap: '32%',
          itemStyle: { color: sky, borderRadius: [4, 4, 0, 0] },
          markLine: uniformLine(),
        };
      }

      var series = [bars(MEAN, byOrder(classMean))];
      emotions.forEach(function (name, i) {
        series.push(bars(name, byOrder(rows[i])));
      });

      var selected = {};
      selected[MEAN] = true;
      emotions.forEach(function (name) { selected[name] = false; });

      // The deck's tick size, the same one the frame axis beside this chart is
      // set in. Twenty-five upright names cost height rather than width, so
      // the extra two pixels come out of the plot and not out of a neighbour.
      var tick = { fontSize: 14, fontFamily: body };
      chart.setOption({
        animation: false,
        textStyle: { color: ink, fontFamily: body },
        // Room at the top for a legend that wraps to a second row, and at
        // the right for the reference line's label. What the y axis measures is
        // in the caption, so the axis itself does not spend a line on a name.
        grid: { left: 8, right: 88, top: 68, bottom: 58, containLabel: true },
        // Set at the deck's legend size, with the chip the other charts use.
        // The colour is the one thing this legend does differently, and for
        // the reason the deck tints anything: only one of the thirteen is
        // being drawn, so that one is ink and the twelve that are not are
        // muted. itemGap stays tighter than elsewhere because thirteen names
        // have to reach the end of the second row and no further.
        legend: {
          top: 4,
          left: 'center',
          selectedMode: 'single',
          selected: selected,
          icon: 'roundRect',
          itemWidth: 14,
          itemHeight: 11,
          itemGap: 14,
          inactiveColor: muted,
          textStyle: { color: ink, fontSize: 14, fontFamily: body },
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          backgroundColor: surface,
          borderColor: line,
          textStyle: { color: ink, fontSize: 15 },
          formatter: function (params) {
            if (!params || !params.length) return '';
            var p = params[0];
            return '<b>' + p.name + '</b>　' + p.seriesName + '<br>share <b>'
              + Number(p.value).toFixed(4) + '</b>　uniform ' + uniform.toFixed(4);
          },
        },
        xAxis: {
          type: 'category',
          data: names,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: line } },
          axisLabel: {
            interval: 0,
            // Twenty-five joint names share about 470px of axis, so each one
            // has under 20px of horizontal room. Tilted 45 degrees, a name
            // like RightToeBase runs across three of its neighbours and the
            // row reads as a smear; upright, each name takes one line height
            // and sits over the bar it belongs to.
            rotate: 90,
            margin: 10,
            formatter: function (name) { return '{' + regionOf(name) + '|' + name + '}'; },
            rich: {
              head: Object.assign({ color: em }, tick),
              arm: Object.assign({ color: accent }, tick),
              leg: Object.assign({ color: ink }, tick),
              torso: Object.assign({ color: muted }, tick),
            },
          },
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: top,
          interval: 0.02,
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: {
            color: muted,
            fontSize: 14,
            fontFamily: body,
            formatter: function (v) { return v.toFixed(2); },
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
