(function () {
  'use strict';

  /* Where the model looks, all twelve emotions at once.

     The bar version of this chart (spatial.js) shows one emotion at a time, so
     a viewer has to remember eleven other bar charts to see that the answer
     never changes. Laid out as a grid it takes one glance: the same few
     columns are dark in every row. Head is the top joint in all twelve
     emotions, and the head, neck and upper spine take about two and a half
     times an even share while the hips and lower spine take under a tenth.

     Joints run along the x axis ordered by the class mean, so the head chain
     leads and every row is read against the same order. Nothing here puts it
     there by hand. Tick labels are coloured by region, which groups the axis
     without spending a legend on it.

     Typography follows the same rule as the other five modules: the body face
     throughout, no mono. Data: window.DeckData.saliency, written by
     scripts/build_site_data.py. Interface and colour tokens:
     build/CONTRACT.md. */

  function css(name, fallback) {
    var value = getComputedStyle(document.documentElement)
      .getPropertyValue(name).trim();
    return value || fallback;
  }

  function family(name, fallback) {
    return css(name, fallback).replace(/"/g, '');
  }

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

  function regionOf(joint) {
    if (/^(Head|Neck|Neck1)$/.test(joint)) return 'head';
    if (/(Shoulder|Arm|Hand)/.test(joint)) return 'arm';
    if (/(Leg|Foot|Toe)/.test(joint)) return 'leg';
    return 'torso';
  }

  function captionRows(text, width) {
    return Math.max(1, Math.ceil((text.length * 7.3) / width));
  }

  window.DeckCharts = window.DeckCharts || {};
  window.DeckCharts.spatialheat = {
    init: function (el, data) {
      var chart = initChart(el);

      var ink = css('--ink', '#333333');
      var muted = css('--muted', '#6B7280');
      var line = css('--line', '#E3E0DA');
      var accent = css('--accent', '#3D6EA5');
      var em = css('--em', '#B25A3C');
      var body = family('--font-body', 'Outfit, system-ui, sans-serif');

      var emotions = data.emotions || [];
      var joints = data.joints || [];
      var rows = data.spatial || [];
      var even = data.uniform || (joints.length ? 1 / joints.length : 0.04);

      var classMean = joints.map(function (_, j) {
        var total = 0;
        for (var i = 0; i < rows.length; i++) total += rows[i][j];
        return total / (rows.length || 1);
      });
      var order = joints.map(function (_, j) { return j; }).sort(function (a, b) {
        return classMean[b] - classMean[a];
      });
      var names = order.map(function (j) { return joints[j]; });

      var cells = [];
      var top = 0;
      for (var r = 0; r < rows.length; r++) {
        for (var c = 0; c < order.length; c++) {
          var v = rows[r][order[c]];
          cells.push([c, r, v]);
          if (v > top) top = v;
        }
      }

      // A sequential ramp from the page ground to the half's own accent, so
      // intensity reads as intensity. The even level sits low on it, which is
      // what makes the head columns look as far from even as they are.
      var ramp = ['#FBF9F6', '#E8EFF7', '#C4E0F9', '#8FB6DC', accent];

      var caption = 'Each cell is one emotion and one joint: its share of that '
        + 'emotion’s saliency. Joints are ordered by the class mean, and an '
        + 'even spread would be ' + even.toFixed(3) + ' everywhere.';

      var region = { head: em, arm: accent, leg: muted, torso: muted };

      function layout() {
        var w = el.clientWidth || 560;
        var capRows = captionRows(caption, Math.max(240, w - 24));
        return {
          grid: { left: 88, right: 14, top: 44, bottom: 92 + capRows * 17 },
          capRows: capRows,
        };
      }

      // The scale, drawn rather than delegated: five swatches of the ramp with
      // its two ends named, sitting above the grid where nothing else is.
      function key(box) {
        var x = box.grid.left, w = 15, gap = 2, out = [];
        out.push({ type: 'text', left: x, top: 4, silent: true,
          style: { text: 'less', fill: muted, font: '11px ' + body } });
        x += 30;
        for (var i = 0; i < ramp.length; i++) {
          out.push({ type: 'rect', left: x, top: 6, silent: true,
            shape: { width: w, height: 10 },
            style: { fill: ramp[i], stroke: line, lineWidth: 0.5 } });
          x += w + gap;
        }
        out.push({ type: 'text', left: x + 4, top: 4, silent: true,
          style: { text: 'more, up to ' + (top * 100).toFixed(0)
            + '% of one emotion’s saliency', fill: muted, font: '11px ' + body } });
        return out;
      }

      function option(reveal) {
        var box = layout();
        return {
          animation: reveal,
          animationDuration: 520,
          textStyle: { fontFamily: body, color: ink },
          grid: box.grid,
          tooltip: {
            trigger: 'item',
            formatter: function (p) {
              return names[p.value[0]] + ' &middot; ' + emotions[p.value[1]]
                + '<br>' + (p.value[2] * 100).toFixed(1) + '% of this emotion’s saliency'
                + '<br>' + (p.value[2] / even).toFixed(1) + '× an even share';
            },
          },
          xAxis: {
            type: 'category',
            data: names,
            axisTick: { show: false },
            axisLine: { lineStyle: { color: line } },
            axisLabel: {
              rotate: 90, interval: 0, fontSize: 11, fontFamily: body, margin: 8,
              color: function (name) { return region[regionOf(name)] || muted; },
            },
          },
          yAxis: {
            type: 'category',
            data: emotions,
            axisTick: { show: false },
            axisLine: { lineStyle: { color: line } },
            axisLabel: { interval: 0, fontSize: 11, fontFamily: body, color: ink },
          },
          // The colour mapping only. ECharts draws its own continuous scale as
          // a tall bar over the plot whatever orient and position it is given
          // here, so the key below is drawn by hand instead, where it goes.
          visualMap: {
            type: 'continuous', min: 0, max: top, show: false,
            inRange: { color: ramp },
          },
          graphic: [{
            id: 'caption', type: 'text', left: 10, bottom: 6, silent: true,
            style: {
              text: caption, fill: muted,
              font: '13px ' + body, lineHeight: 17,
              width: Math.max(240, (el.clientWidth || 560) - 24), overflow: 'break',
            },
          }].concat(key(box)),
          series: [{
            type: 'heatmap',
            data: cells,
            progressive: 0,
            itemStyle: { borderColor: '#FFFFFF', borderWidth: 1 },
            emphasis: { itemStyle: { borderColor: ink, borderWidth: 1.5 } },
          }],
        };
      }

      chart.setOption(option(false));

      return {
        resize: function () { chart.resize(); chart.setOption(option(false)); },
        onEnter: function () { chart.setOption(option(true)); },
        onLeave: function () {},
      };
    },
  };
})();
