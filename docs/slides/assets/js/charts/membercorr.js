(function () {
  'use strict';

  // Per-sample error correlation between the eleven ensemble members, from
  // assets/data/membercorr.js.
  //
  // The file lists the members in training order, so the chart reorders them
  // into their four inductive-bias families and rules a line at each family
  // edge. The reading it supports is that every off-diagonal cell is low and
  // the external column is the palest of them. The colour scale is stretched
  // over the observed range and the diagonal is kept out of it, since a row of
  // 1.00 cells would otherwise flatten every real difference into one shade.

  var RHO = 'ρ';
  var FAMILY_ORDER = ['graph', 'attention', 'hybrid', 'external'];

  function token(name, fallback) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function mix(hex, toward, amount) {
    var a = /^#([0-9a-f]{6})$/i.exec(hex);
    var b = /^#([0-9a-f]{6})$/i.exec(toward);
    if (!a || !b) return hex;
    var x = parseInt(a[1], 16);
    var y = parseInt(b[1], 16);
    function ch(shift) {
      var from = (x >> shift) & 255;
      var to = (y >> shift) & 255;
      return Math.round(from + (to - from) * amount);
    }
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }

  function f2(v) { return v.toFixed(2); }

  function title(word) { return word.charAt(0).toUpperCase() + word.slice(1); }

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
  window.DeckCharts.membercorr = {
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
        graph: peach, attention: sky, hybrid: mint, external: lavender
      };

      var chart = mount(el);

      var n = data.members.length;

      // Families in a fixed order, anything the file adds later falls in after
      // them in the order it first appears.
      var rank = {};
      FAMILY_ORDER.forEach(function (f, i) { rank[f] = i; });
      data.family.forEach(function (f) {
        if (rank[f] === undefined) rank[f] = FAMILY_ORDER.length + Object.keys(rank).length;
      });

      var order = data.members.map(function (_, i) { return i; }).sort(function (a, b) {
        var d = rank[data.family[a]] - rank[data.family[b]];
        return d !== 0 ? d : a - b;
      });
      var names = order.map(function (i) { return data.members[i]; });
      var fams = order.map(function (i) { return data.family[i]; });

      var blocks = [];
      fams.forEach(function (f, i) {
        var open = blocks[blocks.length - 1];
        if (open && open.family === f) open.end = i;
        else blocks.push({ family: f, start: i, end: i });
      });

      var span = data.max - data.min;
      var cells = [];
      names.forEach(function (rowName, y) {
        names.forEach(function (colName, x) {
          if (x === y) return;
          var v = data.matrix[order[y]][order[x]];
          var hot = span > 0 ? (v - data.min) / span : 0;
          cells.push({
            value: [x, y, v],
            row: rowName, col: colName,
            rowFamily: fams[y], colFamily: fams[x],
            label: { color: hot > 0.75 ? surface : ink }
          });
        });
      });

      // Cell labels are the primary reading; colour is the second channel. In
      // a container too narrow to hold two decimals they would collide, so
      // they shrink first and drop out only when there is genuinely no room.
      function labelSize() {
        var cell = ((el.clientWidth || 720) - 200) / n;
        if (cell >= 44) return 15;
        if (cell >= 33) return 13;
        return 0;
      }
      var labelPx = labelSize();

      function renderDiagonal(params, api) {
        var i = api.value(0);
        var p = api.coord([i, i]);
        var w = api.size([1, 0])[0];
        var h = api.size([0, 1])[1];
        var children = [{
          type: 'rect', silent: true,
          shape: { x: p[0] - w / 2 + 1, y: p[1] - h / 2 + 1, width: w - 2, height: h - 2, r: 2 },
          style: { fill: line, opacity: 0.5 },
          enterFrom: { style: { opacity: 0 } }
        }];
        if (labelPx) {
          children.push({
            type: 'text', silent: true,
            style: {
              x: p[0], y: p[1], text: f2(data.matrix[order[i]][order[i]]), fill: muted,
              fontSize: labelPx, fontFamily: font, align: 'center', verticalAlign: 'middle'
            },
            enterFrom: { style: { opacity: 0 } }
          });
        }
        return { type: 'group', children: children };
      }

      // Family bands above the columns, plus the rule at each family edge that
      // makes the four blocks readable without a legend.
      function renderBlock(params, api) {
        var cs = params.coordSys;
        var start = api.value(0);
        var end = api.value(1);
        var family = fams[start];
        var w = api.size([1, 0])[0];
        var h = api.size([0, 1])[1];
        var x0 = api.coord([start, 0])[0] - w / 2;
        var x1 = api.coord([end, 0])[0] + w / 2;
        // A one-column family gets a narrow band, so the name shrinks with it
        // and steps aside entirely when there is no room left.
        var wide = x1 - x0;
        var nameSize = wide >= 90 ? 14 : (wide >= 55 ? 13 : 12);
        var children = [
          {
            type: 'line', silent: true,
            shape: { x1: x0 + 3, y1: cs.y - 15, x2: x1 - 3, y2: cs.y - 15 },
            style: { stroke: familyColor[family] || lemon, lineWidth: 5, fill: 'none' }
          }
        ];
        if (wide >= 26) {
          children.push({
            type: 'text', silent: true,
            style: {
              x: (x0 + x1) / 2, y: cs.y - 21, text: title(family),
              fill: ink, fontSize: nameSize, fontFamily: font,
              align: 'center', verticalAlign: 'bottom'
            }
          });
        }
        if (start > 0) {
          var y0 = api.coord([0, start])[1] - h / 2;
          var edge = { stroke: ink, lineWidth: 2, opacity: 0.7, fill: 'none' };
          children.push({
            type: 'line', silent: true,
            shape: { x1: x0, y1: cs.y, x2: x0, y2: cs.y + cs.height }, style: edge
          });
          children.push({
            type: 'line', silent: true,
            shape: { x1: cs.x, y1: y0, x2: cs.x + cs.width, y2: y0 }, style: edge
          });
        }
        return { type: 'group', children: children };
      }

      function tooltip(o) {
        if (!o.data || !o.data.row) return '';
        return '<div style="font-weight:700;margin-bottom:4px">' + o.data.row
          + ' vs ' + o.data.col + '</div>'
          + 'error correlation ' + RHO + ' = <b>' + f2(o.data.value[2]) + '</b><br/>'
          + title(o.data.rowFamily) + ' vs ' + title(o.data.colFamily)
          + '<div style="color:' + muted + ';font-size:13px;margin-top:5px;max-width:260px;'
          + 'white-space:normal">' + data.note + '</div>';
      }

      function option() {
        return {
          textStyle: { fontFamily: font, color: ink },
          animationDuration: 520,
          grid: { left: 6, right: 78, top: 42, bottom: 6, containLabel: true },
          tooltip: {
            trigger: 'item',
            backgroundColor: surface,
            borderColor: line,
            borderWidth: 1,
            padding: [8, 11],
            textStyle: { color: ink, fontSize: 15, fontFamily: font },
            formatter: tooltip
          },
          xAxis: {
            type: 'category',
            data: names,
            splitArea: { show: false },
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
              interval: 0, rotate: 38, margin: 10,
              fontSize: 14, color: ink, fontFamily: font
            }
          },
          yAxis: {
            type: 'category',
            data: names,
            inverse: true,
            splitArea: { show: false },
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { interval: 0, margin: 10, fontSize: 14, color: ink, fontFamily: font }
          },
          visualMap: {
            seriesIndex: 0,
            type: 'continuous',
            dimension: 2,
            min: data.min,
            max: data.max,
            calculable: false,
            orient: 'vertical',
            right: 10,
            top: 'middle',
            itemWidth: 13,
            itemHeight: 140,
            // Stretched over the range the members actually occupy. Mapping
            // 0 to 1 instead would print eleven rows of the same pale shade.
            inRange: { color: [mix(peach, surface, 0.62), peach, em] },
            text: [f2(data.max), f2(data.min)],
            textGap: 8,
            textStyle: { fontSize: 13, color: muted, fontFamily: font }
          },
          series: [
            {
              type: 'heatmap',
              data: cells,
              itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: 2 },
              label: {
                show: labelPx > 0,
                fontSize: labelPx || 13,
                fontFamily: font,
                formatter: function (o) { return f2(o.data.value[2]); }
              },
              emphasis: { itemStyle: { borderColor: ink, borderWidth: 2 } }
            },
            {
              type: 'custom',
              z: 3,
              silent: true,
              renderItem: renderDiagonal,
              encode: { x: 0, y: 1 },
              data: names.map(function (_, i) { return [i, i]; })
            },
            {
              type: 'custom',
              z: 4,
              silent: true,
              renderItem: renderBlock,
              encode: { x: 0, y: 1 },
              data: blocks.map(function (b) { return [b.start, b.end]; })
            }
          ]
        };
      }

      function draw(replay) {
        chart.setOption(option(), replay ? { replaceMerge: ['series'] } : undefined);
      }

      draw(false);

      function refit() {
        var next = labelSize();
        if (next === labelPx) return;
        labelPx = next;
        chart.setOption({
          series: [{ label: { show: labelPx > 0, fontSize: labelPx || 13 } }]
        });
      }

      return {
        chart: chart,
        resize: function () {
          if (!el.clientWidth) return;
          refit();
          chart.resize();
        },
        dispose: function () { chart.dispose(); },
        onEnter: function () {
          if (!el.clientWidth) return;
          refit();
          chart.resize();
          draw(true);
        },
        onLeave: function () {}
      };
    }
  };
})();
