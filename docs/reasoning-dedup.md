# Reasoning/content duplicate suppression (incremental)

The upstream behind devin-connect can deliver the reasoning twice in one
response: first as reasoning tokens (`reasoning_content`), then verbatim as
content. `src/reasoning-dedup.js` suppresses that duplicate **without holding
the normal answer** — the rework of the earlier settle-flush design, which was
rejected because holding the whole stream breaks progressive streaming for all
thinking models.

## How it works

- While a content chunk byte-matches a prefix of the accumulated reasoning, the
  chunk is held in a tiny in-memory buffer that lives fractions of a second.
- The moment content diverges from the reasoning prefix, everything held so far
  plus the current chunk is emitted immediately — one SSE frame — and the rest
  of the stream passes through untouched.
- At stream end, suppression fires **only** if the content is *still* a
  byte-identical prefix of the reasoning: that is the true duplicate, and it is
  silently dropped.

## Why default-ON is safe

A normal answer never waits for a single extra chunk:

- divergence → immediate release (no buffered delay beyond the divergence
  frame);
- only a byte-identical prefix duplicate is held, and it is suppressed at the
  end, so the client never sees the reasoning twice.

## Invariants

| Stream shape | Held | Emitted | Suppressed at settle() |
| --- | --- | --- | --- |
| content == reasoning (byte-identical) | all chunks | nothing | yes |
| content diverges (anywhere) | only until divergence | everything, at the divergence frame | no |
| reasoning shorter than content | only until content outruns the reasoning | everything | no |
| no reasoning seen | nothing | everything | no |
| non-stream path | — | — | untouched (no dedup) |

## Integration

- `src/handlers/chat.js` wires the module into the unified stream inside
  `streamResponse` — the four egress protocols (openai chat, anthropic
  messages, gemini, responses) all consume the same stream, so one integration
  covers all four.
- `noteReasoning()` is fed from `emitThinking`, `feed()` from `emitContent`,
  and `settle()` runs once at stream end.
- `accText`/`accThinking` keep the full view for the fallback, narrative-scan
  and cascade-history logic — the dedup is client-visible only.