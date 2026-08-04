# WindsurfAPI Docs

## Taking this project over? Read in this order

1. **[HANDOFF-2026-08-04-D.md](HANDOFF-2026-08-04-D.md)** — the current handoff: state, the
   still-unfixed list (with `file:line` and measured numbers), and what is waiting on an
   external contributor. **When there is unreleased work, this is where it is described** —
   right now there is none: master == v3.9.15. Its §5 is the part worth reading before
   touching anything: §5.1 is a case of a *correction* to this ledger being itself wrong,
   which is worse than a wrong claim because a correction makes the next reader stop
   doubting that spot. Read §5 of
   [HANDOFF-2026-08-04-B.md](HANDOFF-2026-08-04-B.md) as well — still the best single
   section in these docs, and its §5.1 ("fixes themselves need a review pass") is why that
   round found six defects in its own repairs.
2. **[AUDIT-LEDGER.md](AUDIT-LEDGER.md)** — which subsystems were *actually probed*, what the
   conclusion was, and where the guard lives. It exists because "scanned and clean" is itself
   an asset: without the record, the next person burns the same time again.
3. **[DEVIN-CONNECT-CUTOVER.md](DEVIN-CONNECT-CUTOVER.md)** — production cutover runbook.
   `DEVIN_CONNECT` is the **default production backend**, so this is not optional reading.
   Includes the paid wire-calibration procedure (§8).

Earlier handoffs: [HANDOFF-2026-08-04-C.md](HANDOFF-2026-08-04-C.md) (v3.9.14 + #240;
**its §0 and §4 are stale** — #234, the Cascade stream spend gap and the CI bumps it lists as
open all shipped in v3.9.15) ·
[HANDOFF-2026-08-04-B.md](HANDOFF-2026-08-04-B.md) (v3.9.13 + the caller-shard
fix and the two tools; **its §0 state table and §4 unfixed list are stale**, its §5 is not) ·
[HANDOFF-2026-08-05.md](HANDOFF-2026-08-05.md) (v3.9.12 + queue-on-pin;
**its filename date is wrong** — the work was 08-04 — and its §3/§4 were superseded within
that same session, kept on purpose) · [HANDOFF-2026-08-04.md](HANDOFF-2026-08-04.md)
(v3.9.9–v3.9.11; its §3 corrects four claims in the handoffs before it) ·
[HANDOFF-2026-08-03-B.md](HANDOFF-2026-08-03-B.md) (v3.9.8) ·
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
