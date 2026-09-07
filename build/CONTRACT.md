# Build contract — nawta.github.io/mmac2026

Every agent working on this site builds against the vocabulary below. Nothing
outside it. If a slide needs something the contract has no name for, add the
component here first, in the same shape as the others, then use it.

## Repository layout

    ~/GITs/mmac2026/
      docs/                       ← GitHub Pages root (.nojekyll present)
        index.html                ← English landing page
        ja/index.html             ← Japanese landing page
        assets/css/style.css      ← landing-page styles (both languages)
        assets/js/charts.js       ← landing-page charts
        assets/data/*.json        ← generated, do not edit
        assets/vendor/            ← echarts + fonts + LICENSES
        slides/
          index.html              ← the deck
          presenter.html          ← presenter window
          assets/css/deck.css     ← design tokens + base + slide frame
          assets/css/slide.css    ← per-slide layout
          assets/css/site.css     ← chrome: slide number, progress, buttons
          assets/css/print.css    ← PDF export (print media only)
          assets/fonts.css        ← @font-face
          assets/js/*.js          ← runtime
          assets/js/charts/*.js   ← one module per chart
          assets/data/*.js        ← generated, do not edit
          assets/img/*.png        ← paper figures
          assets/vendor/          ← echarts, katex, fonts, LICENSES
      scripts/build_site_data.py  ← regenerates every data file
      build/                      ← working files, not published

## Third-party code

Loaded from local files, never a CDN. The deck may use ECharts
(`assets/vendor/echarts.min.js`) and KaTeX (`assets/vendor/katex/`). Their
licences sit in `assets/vendor/LICENSES/` and must stay there.

## Fonts

    --font-display: "Outfit", system-ui, sans-serif      (bundled, Latin)
    --font-body:    "Outfit", system-ui, -apple-system, "Segoe UI", sans-serif
    --font-mono:    "PlemolJP", ui-monospace, SFMono-Regular, Menlo, monospace
    --font-ja:      "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic",
                    "Noto Sans JP", sans-serif

The Japanese page uses `--font-ja` from the reader's system. No Japanese
webfont is bundled, so no character can fall through to a missing glyph.

## Colour tokens (deck.css `:root`)

    --peach:   #FFD4C4    category A / the ensemble half of the talk
    --sky:     #C4E0F9    category B / the explainability half
    --mint:    #C4F0DC    positive results, verdicts that pass
    --lavender:#D8C4F0    supporting category
    --lemon:   #F5F0C4    caveats and honest limits
    --ink:     #333333    body text (never pure black)
    --muted:   #6B7280    captions, secondary text
    --line:    #E3E0DA    hairlines
    --bg:      #FBF9F6    page ground
    --surface: #FFFFFF    cards
    --accent:  #3D6EA5    headings, links
    --em:      #B25A3C    emphasis inside running text

Charts take their series colours from these tokens, in the order peach, sky,
mint, lavender, lemon.

## Slide frame

The deck is one HTML file. Each slide is:

    <section class="slide" id="s-07-orthogonality" data-title="Members disagree">
      <h2>The members rarely fail on the same clip</h2>
      <div class="body"> … </div>
      <aside class="notes"> speaker notes, one paragraph per beat </aside>
    </section>

Rules:
- `id` is `s-<two digits>-<kebab slug>`, numbered in order from 01.
- `data-title` is the short label the presenter view and progress bar show.
- Exactly one `h2` per slide, except `.slide.title` and `.slide.lead`,
  which carry an `h1` instead.
- `.body` holds everything else. `aside.notes` never renders in the deck.
- 16:9. A slide that overflows is a bug; the runtime flags it in the console.

Slide modifier classes: `.title` (opening), `.lead` (statement slide, centred),
`.closing` (final slide), `.section` (divider between the two halves), and
`.both-halves` for a slide that belongs to neither half because it joins them.
A `.both-halves` slide takes the full peach-to-sky spectrum instead of one
half's tone, and declares no `data-tone`.

## Components

    .lead-in            one sentence under the h2, larger than body text
    .cols               horizontal split; `.cols--figure` makes the right
                        column the figure and the left the text
    .card               white surface, rounded 12px, 1px --line border
    .cards              grid of .card, `data-cols="2|3|4"`
    .kpi                one big number; .kpi__value, .kpi__label, .kpi__note
    .kpi-row            row of .kpi, colour-tinted by `data-tone`
    .stat               inline number + unit inside running text
    .callout            tinted box; `data-tone="ok|warn|note"` →
                        mint / lemon / sky
    .verdicts           the six-verdict scorecard grid
    .verdict            one verdict; `data-result="pass|reported-negative"`
    .fig                figure block: <img> + .fig__cap
    .fig--wide          figure spanning the full body width
    .chart              ECharts mount: <div class="chart" data-chart="liftpath"
                        data-src="liftpath" style="height:340px"></div>
    .table              paper table rendered as HTML; .table--compact
    .pill               inline tinted label, `data-tone` as .callout
    .footnote           small print at the bottom of a slide

`data-tone` values map: ok → mint, warn → lemon, note → sky, em → peach.

## Fragments

`data-fragment="1"`, `"2"`, … reveal in order on the same slide. A slide with
no fragments shows everything at once. Keep fragments to at most three steps.

## Charts

One module per chart in `assets/js/charts/<name>.js`:

    window.DeckCharts = window.DeckCharts || {};
    window.DeckCharts.liftpath = {
      init: function (el, data) {           // returns a handle
        var chart = echarts.init(el, null, {renderer: 'svg'});
        chart.setOption({ … });        // SVG, so the deck prints as vector
        return {
          resize:  function () { chart.resize(); },
          onEnter: function () { /* start animation */ },
          onLeave: function () { /* stop it */ },
        };
      }
    };

`data-chart` names the module, `data-src` the `window.DeckData` key. The
runtime mounts every `[data-chart]` on load and calls `onEnter`/`onLeave` as
slides change. A module that throws costs its own figure and nothing else.

## Data keys (generated, read-only)

| key | shape |
|---|---|
| `liftpath` | `{stages:[{key,label,mean,sd,pooled,ci:[lo,hi],perFold:[…]}], chance, gainPp, gainRelPct, nOof}` |
| `membercorr` | `{members:[11], family:[11], matrix:[11][11], min, max, note}` |
| `loo` | `{members:[{member,family,delta}], block:{…}, base, note}` |
| `lma` | `{perEmotion:[{emotion,member,ensemble,kinematics}], headline:{…}, note}` |
| `saliency` | `{emotions:[12], joints:[25], temporal:[12][64], spatial:[12][25], temporalEntropyPct:[12], temporalEntropyMeanPct, uniform, nFrames, note}` |
| `results` | `{header:[…], rows:[[…]]}` — paper Table 1 |
| `negatives` | `{header:[…], rows:[[…]]}` — paper Table 2 |
| `explainability` | `{header:[…], rows:[[…]]}` — paper Table 3 |

## Runtime API

`window.Deck = {state, goto, next, prev, on}`. `state` carries
`{index, total, mode, fragmentStep}`. `on('change', fn)` fires after every
navigation. Keys: → / space / n forward, ← / p back, Home and End for the
two ends of the deck, `f` fullscreen, `b` blank, `s` presenter window.

The deck syncs `?s=<index>&f=<fragment>` to the URL so any slide is linkable,
and reads the same query on load.

## Writing

English throughout, except `docs/ja/index.html`. Conclusion first, then the
reason. No em dashes as connectors, no "not X but Y" framing, no three-item
rhetorical lists, no sentence fragments standing in for sentences. Numbers
carry their sign, their ±, and their unit exactly as the paper prints them.
