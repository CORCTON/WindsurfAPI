# WindsurfAPI Docs

## Taking this project over? Read in this order

1. **[HANDOFF-2026-08-04.md](HANDOFF-2026-08-04.md)** — the current handoff: branch state,
   the still-unfixed list (with `file:line` and measured numbers), what needs a maintainer
   decision, and the methodology this round produced. **When there is unreleased work, this
   is where it is described.** Its §3 CORRECTS four claims made in the earlier handoffs —
   read it before acting on any older item.
2. **[AUDIT-LEDGER.md](AUDIT-LEDGER.md)** — which subsystems were *actually probed*, what the
   conclusion was, and where the guard lives. It exists because "scanned and clean" is itself
   an asset: without the record, the next person burns the same time again.
3. **[DEVIN-CONNECT-CUTOVER.md](DEVIN-CONNECT-CUTOVER.md)** — production cutover runbook.
   `DEVIN_CONNECT` is the **default production backend**, so this is not optional reading.
   Includes the paid wire-calibration procedure (§8).

Earlier handoffs: [HANDOFF-2026-08-03-B.md](HANDOFF-2026-08-03-B.md) (v3.9.8) ·
[HANDOFF-2026-08-03.md](HANDOFF-2026-08-03.md) (the #234 analysis) ·
[HANDOFF-2026-07-27.md](HANDOFF-2026-07-27.md) (v3.9.0–v3.9.6).
Handoff docs are **append-only** — an older one's "still unfixed" list may have gone stale, so
the newest one wins.

## Protocol and product notes

- [Architecture Review](review.html): project map from startup to HTTP routes, protocol bridge,
  account/LS pools, dashboard, security boundaries, tests, and core runtime behavior.
- [Dashboard i18n](dashboard-i18n.md): dashboard localization notes.

## Release history

- [Release notes index](releases/): what changed in each version.
- Release notes are **append-only** history. House style: user-visible first, engineering
  second; every entry states the mechanism and the measured number, never a changelog line.

## Generated output

- [index.html](index.html): GitHub Pages static output. Do **not** treat it as the canonical
  source for operational status.
- [review.html](review.html): the public architecture review page.

## Conventions for this directory

- **Untracked internal docs live in `docs-internal/`** (git-ignored): AI session records,
  scratch analysis, workflow output. Everything in `docs/` is written for an outside reader.
- **Every claim in a doc must be verifiable.** This repo has repeatedly been bitten by
  "a comment explains design intent, not current fact" — before writing "on by default", read
  the default out of the code; before writing "called on X", grep for the call site.
