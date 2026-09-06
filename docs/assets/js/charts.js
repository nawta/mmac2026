/* ============================================================================
   charts.js — the landing pages' figures, results table and page controls.

   The deck mounts its chart modules through a runtime; these pages have none,
   so this file mounts every element that carries [data-chart] itself once the
   document is parsed. The module shape is the deck's: an object per chart with
   an init(el, data) that returns a handle carrying resize() and dispose().

   Data comes from the generated JSON in assets/data/. The path is derived from
   this script's own URL, so docs/ja/index.html loads the same files as
   docs/index.html without configuring anything; window.MMAC_DATA_BASE still
   overrides it if a page ever needs to.

   Colours are read from the CSS custom properties in assets/css/style.css, so
   a colour on the page and a colour inside a chart come from one place, and a
   theme change re-reads them.
   ========================================================================== */
(function () {
  "use strict";

  var PM = "±";      // plus-minus
  var MINUS = "−";   // true minus sign, the one the paper prints
  var RHO = "ρ";

  /* Where the JSON lives. document.currentScript is the <script> element that
     is running, so its src gives assets/js/charts.js as the page resolved it;
     swapping the last two segments gives assets/data/. */
  var DATA_BASE = (function () {
    if (window.MMAC_DATA_BASE) return window.MMAC_DATA_BASE;
    var el = document.currentScript;
    if (el && el.src) return el.src.replace(/js\/charts\.js(\?.*)?$/, "data/");
    return "assets/data/";
  })();

  var mounted = {};   // element id -> handle
  var cache = {};     // file name -> parsed JSON
  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function token(name, fallback) {
    var value = "";
    try {
      value = getComputedStyle(document.documentElement)
        .getPropertyValue(name).replace(/\s+/g, " ").trim();
    } catch (e) { value = ""; }
    return value || fallback;
  }

  function palette() {
    return {
      peach: token("--peach", "#FFD4C4"),
      sky: token("--sky", "#C4E0F9"),
      mint: token("--mint", "#C4F0DC"),
      lavender: token("--lavender", "#D8C4F0"),
      lemon: token("--lemon", "#F5F0C4"),
      ink: token("--ink", "#333333"),
      muted: token("--muted", "#6B7280"),
      line: token("--line", "#E3E0DA"),
      surface: token("--surface", "#FFFFFF"),
      bg: token("--bg", "#FBF9F6"),
      accent: token("--accent", "#3D6EA5"),
      em: token("--em", "#B25A3C"),
      font: token("--font-body", "system-ui, sans-serif").replace(/"/g, "")
    };
  }

  /* A darker relative of a pastel token: the palette is pale by design, so
     fills need an outline of their own to hold an edge. */
  function darken(hex, amount) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var f = 1 - amount;
    return "rgb(" + Math.round(((n >> 16) & 255) * f) + ","
      + Math.round(((n >> 8) & 255) * f) + ","
      + Math.round((n & 255) * f) + ")";
  }

  function f2(v) { return v.toFixed(2); }
  function signed(v, digits) {
    var d = digits === undefined ? 2 : digits;
    return (v < 0 ? MINUS : "+") + Math.abs(v).toFixed(d);
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function getJSON(name) {
    if (cache[name]) return Promise.resolve(cache[name]);
    return fetch(DATA_BASE + name + ".json").then(function (r) {
      if (!r.ok) throw new Error("failed to load " + name + ".json");
      return r.json();
    }).then(function (d) { cache[name] = d; return d; });
  }

  function init(el) {
    var opts = { renderer: "svg" };
    return window.echarts.init(el, null, opts);
  }

  /* A phone gives a chart about a third of the width a laptop does, which is
     not enough for a legend on one line or for four category labels side by
     side. Each chart asks this before it lays itself out and leaves more room
     above the plot, or wraps its labels, when the answer is yes. The threshold
     is the width below which the widest legend here stops fitting on one line.
     mountCharts() rebuilds a chart that crosses it, because resize() alone
     keeps the layout the chart was built with. */
  var NARROW = 560;
  function isNarrow(el) {
    var w = el.clientWidth;
    return w > 0 && w < NARROW;
  }

  /* Break a label into lines no wider than maxPx. ECharts can do this itself,
     but its own wrapping reflows across the line breaks the label already
     carries and will cut a word in half, so the lines are worked out here and
     handed over as text the axis only has to draw. A line may break at a space
     and, where the caller allows it, after a hyphen; "Macro-F1" reads badly
     split over two lines, while "(Region-Aware)" has to break somewhere to fit
     a phone's column. The measuring font is the one the label is drawn in,
     quotes and all, so the shorthand canvas accepts is valid. */
  var measureCtx = null;
  function wrapLabel(text, maxPx, fontPx, atHyphen) {
    if (!maxPx) return text;
    if (!measureCtx) {
      try { measureCtx = document.createElement("canvas").getContext("2d"); }
      catch (e) { return text; }
    }
    if (!measureCtx) return text;
    measureCtx.font = fontPx + "px " + token("--font-body", "system-ui, sans-serif");
    var out = [];
    text.split("\n").forEach(function (line) {
      var parts = [];
      var buf = "";
      for (var i = 0; i < line.length; i++) {
        buf += line.charAt(i);
        if (line.charAt(i) === " " || (atHyphen && line.charAt(i) === "-")) {
          parts.push(buf); buf = "";
        }
      }
      if (buf) parts.push(buf);
      var cur = "";
      parts.forEach(function (part) {
        var joined = cur + part;
        if (cur && measureCtx.measureText(joined.replace(/\s+$/, "")).width > maxPx) {
          out.push(cur.replace(/\s+$/, ""));
          cur = part.replace(/^\s+/, "");
        } else {
          cur = joined;
        }
      });
      out.push(cur.replace(/\s+$/, ""));
    });
    return out.join("\n");
  }

  function tooltipBox(p) {
    return {
      backgroundColor: p.surface,
      borderColor: p.line,
      borderWidth: 1,
      padding: [9, 12],
      extraCssText: "box-shadow:0 6px 20px rgba(0,0,0,.10);",
      textStyle: { color: p.ink, fontSize: 13, fontFamily: p.font }
    };
  }

  var Charts = {};

  /* --------------------------------------------------------------------------
     Figure 1 — the lift path.

     Each bar is a stage's per-fold mean Macro-F1, the whisker on it is the
     standard deviation across the ten folds, and the blue mark beside it is
     the pooled out-of-fold score with its bootstrap interval. The two are kept
     visibly apart because they are two conventions on one system, and reading
     them as a single number is the mistake the figure is drawn to prevent.
     -------------------------------------------------------------------------- */
  Charts.liftpath = {
    init: function (el, data) {
      var p = palette();
      var chart = init(el);
      var stages = data.stages;
      var last = stages.length - 1;
      var tight = isNarrow(el);
      var SPREAD = "per-fold mean " + PM + " SD";
      var POOLED = "pooled out-of-fold, 95% CI";
      /* On a phone the four stage names are wider than the four bands they sit
         under, so they run into one another and the last one falls off the
         right edge. Giving each label the width of its own band makes the text
         wrap inside that band instead. */
      var labelWidth = tight
        ? Math.max(52, Math.floor((el.clientWidth - 72) / stages.length) - 6)
        : null;

      var ceiling = Math.max.apply(null, stages.map(function (s) {
        return Math.max(s.mean + s.sd, s.ci[1]);
      }));
      var axisMax = Math.ceil((ceiling + 5) / 10) * 10;

      var barStyle = stages.map(function (s, i) {
        if (i === 0) {
          return { color: p.line, borderColor: darken(p.line, 0.30),
            borderWidth: 1, borderRadius: [4, 4, 0, 0] };
        }
        return {
          color: p.peach,
          opacity: i === last ? 1 : 0.45 + 0.18 * i,
          borderColor: darken(p.peach, 0.42),
          borderWidth: i === last ? 2 : 1,
          borderRadius: [4, 4, 0, 0]
        };
      });

      function renderSpread(params, api) {
        var i = api.value(0), mean = api.value(1), sd = api.value(2);
        var band = api.size([1, 0])[0];
        var x = api.coord([i, mean])[0];
        var hi = api.coord([i, mean + sd])[1];
        var lo = api.coord([i, mean - sd])[1];
        var c = band * 0.08;
        var stroke = { stroke: p.ink, lineWidth: 1.8, opacity: 0.85, fill: "none" };
        return {
          type: "group",
          children: [
            { type: "line", silent: true, shape: { x1: x, y1: hi, x2: x, y2: lo }, style: stroke },
            { type: "line", silent: true, shape: { x1: x - c, y1: hi, x2: x + c, y2: hi }, style: stroke },
            { type: "line", silent: true, shape: { x1: x - c, y1: lo, x2: x + c, y2: lo }, style: stroke },
            { type: "text", silent: true, style: {
                x: x, y: hi - 9, text: f2(mean) + " " + PM + " " + f2(sd),
                fill: i === last ? p.em : p.ink,
                /* Four of these sit side by side over four bars, so on a phone
                   they have to come down with the rest of the type or the
                   neighbouring pair runs together. */
                fontSize: tight ? 11 : 13,
                fontFamily: p.font, fontWeight: i === last ? 700 : 400,
                align: "center", verticalAlign: "bottom" } }
          ]
        };
      }

      function renderPooled(params, api) {
        var i = api.value(0);
        var band = api.size([1, 0])[0];
        var x = api.coord([i, api.value(1)])[0] - band * 0.33;
        var mid = api.coord([i, api.value(1)])[1];
        var lo = api.coord([i, api.value(2)])[1];
        var hi = api.coord([i, api.value(3)])[1];
        var c = band * 0.05;
        var stroke = { stroke: p.accent, lineWidth: 2, fill: "none" };
        var r = 5;
        return {
          type: "group",
          children: [
            { type: "line", silent: true, shape: { x1: x, y1: hi, x2: x, y2: lo }, style: stroke },
            { type: "line", silent: true, shape: { x1: x - c, y1: hi, x2: x + c, y2: hi }, style: stroke },
            { type: "line", silent: true, shape: { x1: x - c, y1: lo, x2: x + c, y2: lo }, style: stroke },
            { type: "polygon", silent: true,
              shape: { points: [[x, mid - r], [x + r, mid], [x, mid + r], [x - r, mid]] },
              style: { fill: p.accent } }
          ]
        };
      }

      var labels = stages.map(function (s) { return s.label; });

      chart.setOption({
        animation: !reduceMotion,
        animationDuration: 620,
        textStyle: { color: p.ink, fontFamily: p.font },
        /* containLabel reserves room for the tick labels but not for the axis
           name, so left has to cover the rotated "Macro-F1 (%)" itself. */
        grid: { left: 50, right: 14, top: tight ? 64 : 46, bottom: 8, containLabel: true },
        legend: {
          top: 0, right: 4, itemGap: 18, selectedMode: false, icon: "roundRect",
          itemWidth: 12, itemHeight: 10,
          textStyle: { color: p.muted, fontSize: tight ? 11 : 12, fontFamily: p.font },
          data: [SPREAD, POOLED]
        },
        tooltip: Object.assign({
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: function (arr) {
            if (!arr || !arr.length) return "";
            var i = labels.indexOf(arr[0].axisValue);
            if (i < 0) return "";
            var s = stages[i];
            return "<b>" + s.key + "</b><br/>"
              + "per-fold mean " + f2(s.mean) + " " + PM + " " + f2(s.sd) + "%<br/>"
              + "pooled out-of-fold " + f2(s.pooled) + "%, n = " + data.nOof.toLocaleString("en-US") + "<br/>"
              + "bootstrap 95% CI [" + f2(s.ci[0]) + ", " + f2(s.ci[1]) + "]"
              + '<div style="color:' + p.muted + ';font-size:12px;margin-top:5px">'
              + "10-fold leave-performers-out</div>";
          }
        }, tooltipBox(p)),
        xAxis: {
          type: "category", data: labels,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: p.line } },
          axisLabel: {
            interval: 0, fontSize: tight ? 11 : 12, lineHeight: tight ? 13 : 15, margin: 12,
            color: p.ink, fontFamily: p.font,
            formatter: function (value, index) {
              var text = wrapLabel(value, labelWidth, tight ? 11 : 12, true);
              if (index !== last) return text;
              return text.split("\n").map(function (row) { return "{hi|" + row + "}"; }).join("\n");
            },
            rich: { hi: {
              fontSize: tight ? 11 : 12, lineHeight: tight ? 13 : 15,
              fontWeight: 700, color: p.em, fontFamily: p.font
            } }
          }
        },
        yAxis: {
          type: "value", min: 0, max: axisMax, interval: 10,
          name: "Macro-F1 (%)", nameLocation: "middle", nameRotate: 90, nameGap: 44,
          nameTextStyle: { color: p.muted, fontSize: 12, fontFamily: p.font },
          axisLabel: { color: p.muted, fontSize: 12, fontFamily: p.font },
          axisLine: { show: false },
          splitLine: { lineStyle: { color: p.line } }
        },
        series: [
          {
            type: "bar", barWidth: "54%",
            data: stages.map(function (s, i) { return { value: s.mean, itemStyle: barStyle[i] }; }),
            markLine: {
              silent: true, symbol: "none", animation: false,
              data: [{
                yAxis: data.chance,
                lineStyle: { color: p.muted, type: "dashed", width: 1.4 },
                label: { formatter: "chance " + data.chance + "%", position: "insideStartTop",
                  color: p.muted, fontSize: 12, fontFamily: p.font }
              }]
            }
          },
          {
            name: SPREAD, type: "custom", z: 4, silent: true,
            itemStyle: { color: p.ink },
            renderItem: renderSpread, encode: { x: 0, y: 1 },
            data: stages.map(function (s, i) { return [i, s.mean, s.sd]; })
          },
          {
            name: POOLED, type: "custom", z: 4, silent: true,
            itemStyle: { color: p.accent },
            renderItem: renderPooled, encode: { x: 0, y: 1 },
            data: stages.map(function (s, i) { return [i, s.pooled, s.ci[0], s.ci[1]]; })
          }
        ]
      });

      return {
        chart: chart,
        resize: function () { if (el.clientWidth) chart.resize(); },
        dispose: function () { chart.dispose(); }
      };
    }
  };

  /* --------------------------------------------------------------------------
     Figure 2 — leave one member out.

     One horizontal bar per member, coloured by inductive-bias family. Four
     series rather than one so the families carry a legend; each series holds a
     null wherever a row belongs to a different family, and stacking them puts
     every bar back on its own row.
     -------------------------------------------------------------------------- */
  Charts.loo = {
    init: function (el, data) {
      var p = palette();
      var chart = init(el);
      var rows = data.members;
      var tight = isNarrow(el);
      var FAMILY = [
        { key: "Graph-conv.", color: p.sky },
        { key: "Attention", color: p.lavender },
        { key: "Hybrid/MLP", color: p.mint },
        { key: "External (frozen)", color: p.peach }
      ];
      var lo = Math.min.apply(null, rows.map(function (r) { return r.delta; }));
      var axisMin = Math.floor((lo - 0.15) * 10) / 10;

      var series = FAMILY.map(function (fam) {
        return {
          name: fam.key, type: "bar", stack: "loo", barWidth: "62%",
          itemStyle: { color: fam.color, borderColor: darken(fam.color, 0.40),
            borderWidth: 1, borderRadius: [4, 0, 0, 4] },
          data: rows.map(function (r) { return r.family === fam.key ? r.delta : null; }),
          label: {
            show: true, position: "left", distance: 7,
            color: p.ink, fontSize: 12, fontFamily: p.font,
            formatter: function (o) { return o.value === null ? "" : signed(o.value); }
          }
        };
      });

      chart.setOption({
        animation: !reduceMotion,
        animationDuration: 560,
        textStyle: { color: p.ink, fontFamily: p.font },
        /* The four family names take two lines on a phone, and the second line
           would otherwise sit on top of the first bar. */
        grid: { left: 8, right: 18, top: tight ? 70 : 40, bottom: tight ? 48 : 34, containLabel: true },
        legend: {
          top: 0, left: 0, itemGap: 16, icon: "roundRect", itemWidth: 12, itemHeight: 10,
          selectedMode: false,
          textStyle: { color: p.muted, fontSize: 12, fontFamily: p.font }
        },
        tooltip: Object.assign({
          trigger: "item",
          formatter: function (o) {
            var r = rows[o.dataIndex];
            return "<b>" + r.member + "</b><br/>" + r.family + "<br/>"
              + "pooled out-of-fold Macro-F1 " + signed(r.delta) + " pp<br/>"
              + '<span style="color:' + p.muted + '">' + f2(data.base) + "% with every member</span>";
          }
        }, tooltipBox(p)),
        xAxis: {
          type: "value", min: axisMin, max: 0,
          /* The name is centred on the plot, which the member names push to the
             right, so on a phone its tail runs off the edge unless it is given
             a second line. */
          name: wrapLabel("change in pooled out-of-fold Macro-F1 (pp)",
            tight ? Math.max(150, el.clientWidth - 140) : 0, 12),
          nameLocation: "middle", nameGap: 26,
          nameTextStyle: { color: p.muted, fontSize: 12, fontFamily: p.font, lineHeight: 15 },
          axisLabel: {
            color: p.muted, fontSize: 12, fontFamily: p.font,
            formatter: function (v) { return v === 0 ? "0" : MINUS + Math.abs(v).toFixed(1); }
          },
          axisLine: { show: false },
          splitLine: { lineStyle: { color: p.line } }
        },
        yAxis: {
          type: "category", inverse: true,
          data: rows.map(function (r) { return r.member; }),
          axisTick: { show: false },
          axisLine: { lineStyle: { color: p.line } },
          axisLabel: { color: p.ink, fontSize: 12, fontFamily: p.font }
        },
        series: series
      });

      return {
        chart: chart,
        resize: function () { if (el.clientWidth) chart.resize(); },
        dispose: function () { chart.dispose(); }
      };
    }
  };

  /* --------------------------------------------------------------------------
     Figure 3 — per-emotion alignment with the Laban vocabulary.

     Three bars per emotion: one strong member, the submitted ensemble, and
     the classical-kinematics control. Each value is a Spearman correlation
     over four body regions, so the rows are coarse on purpose; the dashed rule
     is the pooled member correlation the claim actually rests on.
     -------------------------------------------------------------------------- */
  Charts.lma = {
    init: function (el, data) {
      var p = palette();
      var chart = init(el);
      var rows = data.perEmotion;
      var head = data.headline;
      var tight = isNarrow(el);
      var NAMES = {
        member: "one strong member",
        ensemble: "submitted ensemble",
        kinematics: "ordinary motion measurements"
      };
      var COLOR = { member: p.sky, ensemble: p.mint, kinematics: p.muted };

      function bars(key) {
        return {
          name: NAMES[key], type: "bar",
          barCategoryGap: "34%", barGap: "12%",
          itemStyle: {
            color: key === "kinematics" ? "rgba(128,128,128,0.35)" : COLOR[key],
            borderColor: key === "kinematics" ? p.muted : darken(COLOR[key], 0.40),
            borderWidth: 1
          },
          data: rows.map(function (r) { return r[key]; })
        };
      }

      var memberSeries = bars("member");
      memberSeries.markLine = {
        silent: true, symbol: "none", animation: false,
        data: [{
          xAxis: head.memberRho,
          lineStyle: { color: p.em, type: "dashed", width: 1.6 },
          label: {
            formatter: "pooled " + RHO + " = " + signed(head.memberRho, 3),
            position: "start", rotate: 0, distance: 6, align: "center", verticalAlign: "bottom",
            color: p.em, fontSize: 12, fontFamily: p.font
          }
        }]
      };

      chart.setOption({
        animation: !reduceMotion,
        animationDuration: 560,
        textStyle: { color: p.ink, fontFamily: p.font },
        /* The three series names do not fit on one line on a phone. A scrolling
           legend would page two of them out of sight and leave the reader with
           three unlabelled colours, so the legend wraps and the plot starts
           below however many lines it takes. */
        grid: { left: 8, right: 16, top: tight ? 108 : 74, bottom: 34, containLabel: true },
        legend: {
          top: 0, left: 0, itemGap: 14, icon: "roundRect", itemWidth: 12, itemHeight: 10,
          selectedMode: false, width: "94%",
          textStyle: { color: p.muted, fontSize: 12, fontFamily: p.font }
        },
        tooltip: Object.assign({
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: function (arr) {
            if (!arr || !arr.length) return "";
            var i = arr[0].dataIndex;
            var r = rows[i];
            return "<b>" + cap(r.emotion) + "</b><br/>"
              + "member " + RHO + " = " + signed(r.member, 2) + "<br/>"
              + "ensemble " + RHO + " = " + signed(r.ensemble, 2) + "<br/>"
              + "kinematics control " + RHO + " = " + signed(r.kinematics, 2)
              + '<div style="color:' + p.muted + ';font-size:12px;margin-top:5px">'
              + "Spearman over four body regions</div>";
          }
        }, tooltipBox(p)),
        xAxis: {
          type: "value", min: -1, max: 1, interval: 0.5,
          name: "Spearman " + RHO + " (per emotion)",
          nameLocation: "middle", nameGap: 26,
          nameTextStyle: { color: p.muted, fontSize: 12, fontFamily: p.font },
          axisLabel: {
            color: p.muted, fontSize: 12, fontFamily: p.font,
            formatter: function (v) { return v === 0 ? "0" : (v < 0 ? MINUS : "+") + Math.abs(v).toFixed(1); }
          },
          axisLine: { show: true, onZero: true, lineStyle: { color: p.muted } },
          splitLine: { lineStyle: { color: p.line } }
        },
        yAxis: {
          type: "category", inverse: true,
          data: rows.map(function (r) { return cap(r.emotion); }),
          axisTick: { show: false },
          axisLine: { lineStyle: { color: p.line } },
          axisLabel: { color: p.ink, fontSize: 12, fontFamily: p.font }
        },
        series: [memberSeries, bars("ensemble"), bars("kinematics")]
      });

      return {
        chart: chart,
        resize: function () { if (el.clientWidth) chart.resize(); },
        dispose: function () { chart.dispose(); }
      };
    }
  };

  /* --------------------------------------------------------------------------
     The main results table, built from the same JSON the deck reads.

     A row of one cell that starts with "#" is a footnote carried down from the
     paper's table; it leaves the table body and prints underneath. Cell text
     is written with textContent, so the star markers and the plus-minus signs
     arrive exactly as the paper set them.
     -------------------------------------------------------------------------- */
  function renderResultsTable() {
    var head = document.querySelector("[data-results-head]");
    var body = document.querySelector("[data-results-body]");
    var notes = document.querySelector("[data-results-notes]");
    if (!head || !body) return Promise.resolve();

    return getJSON("results").then(function (d) {
      var tr = document.createElement("tr");
      d.header.forEach(function (name, i) {
        var th = document.createElement("th");
        th.scope = "col";
        th.textContent = name;
        if (i > 0) th.style.textAlign = "left";
        tr.appendChild(th);
      });
      head.innerHTML = "";
      head.appendChild(tr);

      body.innerHTML = "";
      if (notes) notes.innerHTML = "";

      d.rows.forEach(function (row) {
        if (row.length === 1 && /^#/.test(row[0])) {
          if (!notes) return;
          var pnote = document.createElement("p");
          pnote.textContent = row[0].replace(/^#\s*/, "");
          notes.appendChild(pnote);
          return;
        }
        var r = document.createElement("tr");
        var name = row[0] || "";
        if (name === "STGCN++ reproduced") r.className = "row-base";
        if (/submitted/i.test(name)) r.className = "row-key";
        row.forEach(function (cell, i) {
          var node = document.createElement(i === 0 ? "th" : "td");
          if (i === 0) node.scope = "row";
          if (i > 0 && /^[\[\d]|^n\/a/.test(cell)) node.className = "num";
          node.textContent = cell;
          r.appendChild(node);
        });
        body.appendChild(r);
      });
    }).catch(function (e) {
      body.innerHTML = "";
      var r = document.createElement("tr");
      r.className = "is-placeholder";
      var td = document.createElement("td");
      td.colSpan = 5;
      td.textContent = "The results table could not be loaded. The same numbers are in Table 1 of the paper.";
      r.appendChild(td);
      body.appendChild(r);
      console.error(e);
    });
  }

  /* -------------------------------------------------------------------------- */

  function mountCharts() {
    var nodes = document.querySelectorAll(".chart[data-chart]");
    var pending = [];
    Array.prototype.forEach.call(nodes, function (el) {
      var name = el.getAttribute("data-chart");
      var src = el.getAttribute("data-src") || name;
      var module = Charts[name];
      var key = el.id || name;
      if (!module) return;
      if (!window.echarts) { fallback(el, "This figure needs the bundled chart library, which did not load."); return; }
      pending.push(getJSON(src).then(function (d) {
        if (mounted[key]) { mounted[key].dispose(); delete mounted[key]; }
        el.innerHTML = "";
        mounted[key] = module.init(el, d);
        /* Remembered so a resize can tell a change of width from a change of
           layout: the wide and the narrow builds differ by more than scale. */
        mounted[key].el = el;
        mounted[key].narrow = isNarrow(el);
      }).catch(function (e) {
        fallback(el, "This figure's data could not be loaded. The same numbers are in the caption.");
        console.error(e);
      }));
    });
    return Promise.all(pending);
  }

  function fallback(el, message) {
    el.innerHTML = "";
    var pnode = document.createElement("p");
    pnode.className = "chart__fallback";
    pnode.textContent = message;
    el.appendChild(pnode);
  }

  /* Theme. Nothing is written to the root element until the reader asks for a
     theme, so the page follows the system setting by default; once a choice is
     stored it wins in both directions. The charts are rebuilt afterwards
     because their colours were read from the tokens that just changed. */
  function currentTheme() {
    var set = document.documentElement.getAttribute("data-theme");
    if (set === "light" || set === "dark") return set;
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark" : "light";
  }

  function setupTheme() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    function sync() {
      var dark = currentTheme() === "dark";
      btn.textContent = dark ? "☾" : "☀";
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
    }
    sync();
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("mmac-theme", next); } catch (e) {}
      sync();
      requestAnimationFrame(mountCharts);
    });
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onSystemChange = function () {
        if (document.documentElement.hasAttribute("data-theme")) return;
        sync();
        mountCharts();
      };
      if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
      else if (mq.addListener) mq.addListener(onSystemChange);
    }
  }

  function setupCopy() {
    var btns = document.querySelectorAll("[data-copy-target]");
    Array.prototype.forEach.call(btns, function (btn) {
      var label = btn.textContent;
      btn.addEventListener("click", function () {
        var target = document.getElementById(btn.getAttribute("data-copy-target"));
        if (!target) return;
        var done = function (ok) {
          btn.textContent = ok ? "Copied" : "Select and copy";
          setTimeout(function () { btn.textContent = label; }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(target.textContent).then(function () { done(true); },
            function () { done(false); });
        } else {
          done(false);
        }
      });
    });
  }

  /* A page opened at #some-section jumps before the table and the charts have
     loaded, and both of them grow the document once they do, which leaves the
     reader below the heading they asked for. This puts them back, unless they
     have already started moving around the page themselves. */
  var userMoved = false;
  ["wheel", "touchstart", "keydown", "pointerdown"].forEach(function (type) {
    window.addEventListener(type, function () { userMoved = true; },
      { once: true, passive: true });
  });

  function restoreHash() {
    if (userMoved || !location.hash) return;
    var target = document.getElementById(location.hash.slice(1));
    /* "instant" and not "auto": auto defers to the stylesheet, which asks for
       smooth scrolling, and animating the whole page height to correct a jump
       the reader never saw is the wrong picture. */
    if (target) target.scrollIntoView({ behavior: "instant", block: "start" });
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var relayout = Object.keys(mounted).some(function (k) {
        var h = mounted[k];
        return h.el && h.el.clientWidth > 0 && isNarrow(h.el) !== h.narrow;
      });
      if (relayout) { mountCharts(); return; }
      Object.keys(mounted).forEach(function (k) { mounted[k].resize(); });
    }, 150);
  });

  document.addEventListener("DOMContentLoaded", function () {
    setupTheme();
    setupCopy();
    Promise.all([renderResultsTable(), mountCharts()]).then(function () {
      setTimeout(restoreHash, 60);
    });
    /* Again once everything has loaded: a browser that restores its own scroll
       position does it after this point, and it would undo the call above. */
    window.addEventListener("load", function () { setTimeout(restoreHash, 150); });
  });
})();
