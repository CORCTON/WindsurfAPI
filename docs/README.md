# WindsurfAPI Docs

## Taking this project over? Read these three, in this order

| # | File | Why |
|---|---|---|
| 1 | **[HANDOFF-2026-08-04-E.md](HANDOFF-2026-08-04-E.md)** | Current state, the still-unfixed list with `file:line` and measured numbers, and what is blocked on someone else. **Unreleased work, when there is any, is described here** — right now there is none: master == `v3.9.18`. That handoff is **closed** (its §7): v3.9.18 shipped, so the next round starts a new file rather than appending. Read its §3 first (two operational rules that will trip you within minutes), then §0.1, then §5–§6. |
| 2 | **[AUDIT-LEDGER.md](AUDIT-LEDGER.md)** | Which subsystems were *actually probed*, the conclusion, and where the guard lives. Start with its "怎么读这份文件" section — it is 1200+ lines appended over twelve rounds and is **not** organised by topic. |
| 3 | **[DEVIN-CONNECT-CUTOVER.md](DEVIN-CONNECT-CUTOVER.md)** | Production cutover runbook. `DEVIN_CONNECT` is what production actually runs (the code default is OFF; the deployment sets it), so this is not optional. Paid wire-calibration procedure in §8. |

Two sections are worth reading even though they sit in superseded files:

- **[HANDOFF-2026-08-04-B.md](HANDOFF-2026-08-04-B.md) §5** — the best single section in these
  docs. §5.1 ("fixes themselves need a review pass") is why that round found six defects in
  its own repairs.
- **[HANDOFF-2026-08-04-E.md](HANDOFF-2026-08-04-E.md) §5.1** — a *correction* written into the
  audit ledger that was itself wrong. Worse than a wrong claim, because a correction makes the
  next reader stop doubting that spot.

### The rest of the handoffs are archive

Newest first. Every one carries a banner pointing here, so opening the wrong file is
recoverable — but **`ls docs/` does not sort chronologically**: `-B.md` sorts before `.md`, and
`HANDOFF-2026-08-05.md` has a wrong filename date (the work was 08-04, it covers v3.9.12).
Trust this list, not the directory listing.

| Handoff | Covers |
|---|---|
| [08-04-D](HANDOFF-2026-08-04-D.md) | v3.9.15 — #234's last criterion, Cascade stream spend, CI node24 |
| [08-04-C](HANDOFF-2026-08-04-C.md) | v3.9.14 — #240 budget split |
| [08-04-B](HANDOFF-2026-08-04-B.md) | v3.9.13 — caller-shard fix, `npm run mutate`, git hooks |
| [08-05](HANDOFF-2026-08-05.md) | v3.9.12 — queue-on-pin (**misdated filename**) |
| [08-04](HANDOFF-2026-08-04.md) | v3.9.9–v3.9.11 — its §3 corrects four earlier claims |
| [08-03-B](HANDOFF-2026-08-03-B.md) | v3.9.8 |
| [08-03](HANDOFF-2026-08-03.md) | the first #234 analysis |
| [07-27](HANDOFF-2026-07-27.md) | v3.9.0–v3.9.6 |

Handoffs are **append-only**: a superseded one keeps its original conclusions, wrong ones
included, because how a conclusion was reached is part of the record. For current state, the
newest always wins.

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
- **A *correction* to an existing doc needs a HIGHER evidence bar than a new claim, not a
  lower one.** A new claim gets audited next round; "I checked, and what the last round wrote
  is false" makes the next reader *stop* doubting that spot. One such correction has already
  been wrong (audit ledger round 12): two greps both hit the right file, and the conclusion was
  drawn from the matching lines without opening it. Before correcting, open the file.
- **One handoff per RELEASE, not per session.** Five handoffs were written on 2026-08-04 alone,
  each superseding the last, and the result is a directory whose filename order is not
  chronological and eight files that need banners to say "not this one". Amending the current
  handoff in place is fine and preferred while its version is still unreleased; start a new
  file once a tag ships. Numbers inside a handoff (gate counts, mutation totals, file counts)
  must be re-measured when it is amended — they are the fastest thing in these docs to rot.
- **Don't cite a section by number without opening it.** `§5.2` in a file you last read three
  rounds ago is a citation, and citations here are held to the same standard as `file:line`.
