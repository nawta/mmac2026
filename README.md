# MMAC @ ACII 2026 talk site

This repository holds the talk site for the ACII 2026 oral paper **Orthogonal
Ensembles and Tested Explanations for Performer-Independent Body-Motion Emotion
Recognition** by Naoto Nishida and Yoshio Ishiguro (The University of Tokyo).
The paper appears in the MMAC Challenge session on cross-cultural emotion
recognition from body movements, on the DIEM-A subset.

- 📊 **Talk page:** <https://nawta.github.io/mmac2026/> (source in [`docs/`](docs/))
- 🇯🇵 **Japanese page:** <https://nawta.github.io/mmac2026/ja/> (source in [`docs/ja/`](docs/ja/))
- 🖥️ **Slides:** <https://nawta.github.io/mmac2026/slides/> (source in [`docs/slides/`](docs/slides/))
- ⚖️ **Third-party licences:** [`docs/assets/vendor/LICENSES/`](docs/assets/vendor/LICENSES/)
  and [`docs/slides/assets/vendor/LICENSES/`](docs/slides/assets/vendor/LICENSES/)

## Results

The numbers below come from 10-fold leave-performers-out cross-validation on the
labeled training performers. They are not a leaderboard placement, and the
hidden-test result is still pending.

| System | Trainable params (M)‡ | Macro-F1 (mean ± SD) | Macro-F1 95% CI | Accuracy (mean ± SD) |
|---|---|---|---|---|
| STGCN++ official baseline | 1.40★ | 25.21 ± 4.49★ | n/a★ | 27.11 ± 3.67★ |
| STGCN++ reproduced | 1.41 | 25.73 ± 4.03 | [25.37, 27.23] | 27.54 ± 3.92 |
| Best single (Region-Aware) | 1.03 | 30.05 ± 3.48 | [29.32, 31.15] | 30.87 ± 3.43 |
| 7-way ensemble | 12.98 | 33.86 ± 2.92 | [33.01, 35.04] | 34.68 ± 3.00 |
| **11-way logit-mean (submitted)** | **12.98** | **36.80 ± 4.00** | **[35.90, 37.94]** | **37.40 ± 4.06** |

Main results on DIEM-A (10-fold LPO, 74-performer train split). Final row =
submitted model. Macro-F1 / Accuracy = 10-fold LPO per-fold mean ± SD (the
official convention); fusion = logit-mean (mean of raw logits); 95% CI =
sample-level paired bootstrap, 1000 iter, seed 42, on pooled OOF. Pooled-OOF F1
is a secondary, descriptive number: 7-way 34.03%, 11-way logit-mean 36.94%.

- ★ Reported by the challenge (92-performer full LPO, official 25.2 % ± 4.5 %,
  no bootstrap CI). We did not re-evaluate it with our script. Our reproduction
  (25.73 ± 4.03) is within one SD of the official number, so we treat the
  official baseline as an external anchor only, and every improvement figure
  compares systems on the same split.
- ‡ Counts are trainable parameters. Each frozen external branch adds fewer than
  0.01 M of them.

The talk compares the last row with the reproduced baseline in the second row:
36.80 − 25.73 = **+11.07 pp**, or +43% relative, on the same split and under the
same per-fold convention. Chance on this 12-class task is 8.3%.

## Running it locally

Serve `docs/` with any static server:

    python3 -m http.server 8000 --directory docs

Then open <http://localhost:8000/> for the English page, `/ja/` for the Japanese
one and `/slides/` for the deck.

Opening `docs/index.html` or `docs/slides/index.html` from the file system works
too, because every path is relative and every library sits in the repository.
The deck loads its data as plain scripts, so it needs nothing more. The landing
pages fetch their numbers from JSON files, which some browsers block on
`file://` pages, so start the server if a chart comes up empty.

## Regenerating the data files

`scripts/build_site_data.py` reads the stored results behind the paper's own
figures and tables, then writes the data files the page and the deck load, so a
number on a slide and the same number in the paper come from one source.

    python3 scripts/build_site_data.py --paper-repo ~/GITs/LaTeX/MMAC_ACII2026

It needs Python 3 and NumPy. The inputs, with paths relative to the paper
repository:

| data | source |
|---|---|
| lift path | `MMAC_ACII2026/paper/figures/fig02_lift_path_stats.json`, `MMAC_ACII2026/paper/reconcile_f1.json` |
| member error correlations | `MMAC_ACII2026/paper/figures/fig04_member_corr_values.csv` |
| leave-one-member-out deltas | `tables/table_member_loo.tex` |
| temporal and spatial saliency | `MMAC_ACII2026/experiments/exp078_temporal_spatial_saliency/results.npz` |
| Laban alignment per emotion | `MMAC_ACII2026/experiments/exp091_ensemble_lma_faithfulness/results_single_model.json` and `results_11way.json` |
| Tables 1, 2 and 3 | `MMAC_ACII2026/paper/tables/table1_main_results.csv`, `table2_negatives.csv`, `table3_explainability.csv` |

Output goes to `docs/slides/assets/data/*.js`, which assign to `window.DeckData`,
and to `docs/assets/data/*.json`. Both directories are committed, because GitHub
Pages serves them from the branch. The script ends by printing three values next
to the ones the paper reports: the gain, the mean temporal-saliency entropy and
the range of the member error correlations.

`python3 scripts/check_claims.py` then reads every published file and checks that
the paper's fixed numbers appear exactly as the paper writes them and that no
claim the presentation brief rules out has crept in. It exits non-zero on any
failure.

## Deck controls

| key | |
|---|---|
| <kbd>→</kbd> <kbd>↓</kbd> <kbd>Space</kbd> <kbd>PageDown</kbd> <kbd>n</kbd> | forward, one fragment or one slide at a time |
| <kbd>←</kbd> <kbd>↑</kbd> <kbd>PageUp</kbd> <kbd>p</kbd> | back |
| <kbd>Home</kbd> <kbd>End</kbd> | first slide, last slide |
| <kbd>f</kbd> | fullscreen |
| <kbd>b</kbd> | blank the screen, <kbd>Esc</kbd> brings it back |
| <kbd>s</kbd> | open the presenter window |
| <kbd>t</kbd> | start or pause the talk timer |
| <kbd>Shift</kbd>+<kbd>R</kbd> | reset the timer |

The presenter window takes the same navigation, blanking and timer keys, and
adds <kbd>+</kbd> and <kbd>-</kbd> to resize the speaker notes.

The deck writes its position into the URL as `?s=<slide>&f=<fragment>` and reads
it back on load, so every slide has its own link.

## Exporting the deck as a PDF

Open the deck, print it (<kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>P</kbd>) and save as
PDF. `docs/slides/assets/css/print.css` sets the page to 297×167 mm, matching
the 16:9 shape of the slides, puts one slide on each page, reveals every
fragment and hides the on-screen controls. Leave the browser's own scale and
margin settings alone. If the pastel fills come out white, turn on background
graphics in the print dialog.

## Third-party code and fonts

Nothing loads from a CDN.

| what | version | licence |
|---|---|---|
| Apache ECharts, every chart on the page and in the deck | 5.6.0 | Apache-2.0, with its NOTICE |
| KaTeX, maths in the deck | 0.18.1 | MIT |
| Outfit, display and body type | variable | SIL OFL 1.1 |
| PlemolJP, monospace | 400 and 700 | SIL OFL 1.1 |

Licence texts sit in [`docs/assets/vendor/LICENSES/`](docs/assets/vendor/LICENSES/)
and [`docs/slides/assets/vendor/LICENSES/`](docs/slides/assets/vendor/LICENSES/),
and each folder carries the full set, so the licences stay with the files they
cover. KaTeX ships with the deck only, while the landing pages need ECharts
and the fonts. The Japanese page uses fonts already installed on the reader's
machine, so no Japanese webfont ships here and no character falls back to a
missing glyph. The images in `docs/slides/assets/img/` are the paper's own
figures.
