#!/usr/bin/env python3
"""Check the site against the paper's frozen numbers and its guardrails.

The presentation brief fixes a list of numbers that must appear exactly as the
paper prints them, and a list of claims the talk must not make. This walks
every published file and reports both kinds of failure. It is a text check, so
it catches a number that drifted and a phrase that crept in, not a claim made
in words it has never seen.

    python3 scripts/check_claims.py        # exits non-zero on any failure
"""

import re
import sys
from pathlib import Path

# Numbers the brief marks with a star: these must appear somewhere, spelled
# exactly this way. The unicode minus and the +- sign are part of the string.
REQUIRED = [
    "25.73 ± 4.03",     # reproduced baseline
    "36.80 ± 4.00",     # submitted ensemble, the headline
    "+11.07 pp",        # protocol-matched gain
    "8.3%",             # chance, 12 classes
    "+0.500",           # LMA alignment, explained member
    "+0.033",           # classical-kinematics control
    "+0.517",           # LMA alignment, submitted ensemble
    "+0.124 ± 0.031",   # faithfulness AUC gap
    "+0.983 ± 0.039",   # stability
    "37.23%",           # hidden-test Macro-F1, the organisers' final leaderboard
]

# Values and phrasings the brief bans outright.
# One coincidence, so nobody "fixes" the data later: 35.78 also occurs in
# docs/**/data/liftpath.* as fold 2 of the 7-way logit-mean per-fold scores,
# which is a real value of a permitted series. The banned 35.78 is the 11-way
# softmax-mean pooled score, a different quantity with the same digits. Data
# directories are skipped below, so the two never collide.
BANNED = [
    (r"33\.72", "softmax-mean absolute value, banned from every slide"),
    (r"35\.78", "softmax-mean absolute value, banned from every slide"),
    (r"\+11\.7\s*pp", "the gain is +11.07 pp against our own reproduction"),
    (r"beats? the (official )?benchmark", "the official baseline is an anchor, not a comparison"),
    (r"state[- ]of[- ]the[- ]art", "no such claim is supported"),
    # Only an unnegated claim counts. "we do not read it as a cultural finding"
    # is the wording the brief asks for, so it must not trip the check.
    (r"(?<!not )(?<!never )(?<!neither )(?<!no )a cultural (finding|difference|effect)",
     "Japan/Taiwan is a dataset stratum"),
    (r"(prove|proves|proof) that the model (causally )?(reads|uses)",
     "counterfactual edits corroborate, they do not prove"),
    (r"(test|leaderboard)[^.<]{0,60}\bpending", "the hidden-test result is out: 37.23% Macro-F1"),
]

# Every caveat the brief requires to travel with its containment clause.
# Checked on pages only. A chart module may label an axis "cross-validation"
# without restating the caveat, because the slide around it carries it.
PAIRED = [
    ("cross-validation", ["37.23", "not a leaderboard", "hidden test", "hidden-test"],
     "the cross-validation headline needs the hidden-test score or the not-a-leaderboard note beside it"),
]


def files(root: Path):
    for p in sorted(root.glob("docs/**/*")):
        if p.suffix in {".html", ".md", ".css", ".js"} and "vendor" not in p.parts:
            if p.parent.name == "data":       # generated, checked at its source
                continue
            yield p
    readme = root / "README.md"
    if readme.exists():
        yield readme


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    corpus = {p: p.read_text(encoding="utf-8", errors="replace") for p in files(root)}
    joined = "\n".join(corpus.values())
    bad = 0

    print("required numbers")
    for want in REQUIRED:
        hits = sum(1 for t in corpus.values() if want in t)
        if hits:
            print(f"  ok      {want}   in {hits} file(s)")
        else:
            print(f"  MISSING {want}")
            bad += 1

    print("\nbanned claims")
    for pattern, why in BANNED:
        for path, text in corpus.items():
            for m in re.finditer(pattern, text, re.IGNORECASE):
                line = text[:m.start()].count("\n") + 1
                before = text[max(0, m.start() - 60):m.start()].lower()
                if re.search(r"\b(not|never|no|rather than|instead of)\b[^.]{0,40}$", before):
                    continue                      # the sentence rules the claim out
                print(f"  FOUND   {path.relative_to(root)}:{line}  {m.group(0)!r}  ({why})")
                bad += 1
    if not bad:
        print("  ok      none found")

    print("\ncaveat containment")
    for trigger, clauses, why in PAIRED:
        for path, text in corpus.items():
            if path.suffix != ".html" and path.name != "README.md":
                continue
            if trigger.lower() in text.lower() and not any(c.lower() in text.lower() for c in clauses):
                print(f"  CHECK   {path.relative_to(root)}  {why}")
                bad += 1

    print(f"\n{'FAIL' if bad else 'PASS'}  {bad} problem(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
