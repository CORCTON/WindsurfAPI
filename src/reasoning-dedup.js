// Incremental reasoning/content duplicate suppression (Thinking dedup rework).
//
// PROBLEM
// The upstream behind devin-connect can deliver the reasoning twice in one
// response: first as reasoning tokens (reasoning_content), then verbatim as
// content. The first T4 design held ALL content until stream end and only then
// decided whether to emit it ("settle-flush"). That was rejected: holding the
// whole stream delays every chunk of a normal answer, which breaks progressive
// streaming for all thinking models.
//
// POLICY (this rework)
// We never hold the normal answer. Instead:
//
//   - While a content chunk byte-matches a prefix of the accumulated reasoning,
//     the chunk may be HELD in a tiny buffer that lives fractions of a second.
//   - As soon as content diverges from the reasoning prefix, EVERYTHING held so
//     far plus the current chunk is emitted immediately, and the stream then
//     passes through with no further delay.
//   - Suppression happens ONLY when, at stream end, the content is still
//     byte-identical to a prefix of the reasoning — that is the true duplicate.
//
// Net effect: identical duplicates are suppressed; a normal answer never waits
// for a single extra chunk beyond the divergence point.
//
// INVARIANTS
//   - content == reasoning (byte-identical)            → suppressed at settle()
//   - content diverges from the reasoning              → everything emitted at
//     the moment of divergence; the stream passes through afterwards
//   - no reasoning seen yet                            → pure passthrough
//   - settle() with an empty held buffer               → no-op
//
// The module is protocol-agnostic and dependency-free: it only ever compares
// strings. It never sees SSE frames, model names or client state, and it has
// no imports from the rest of the codebase.
//
// API (returned by createStreamReasoningDedup()):
//   noteReasoning(text) → void
//       Append a reasoning delta to the accumulated reasoning string. Call only
//       with non-empty text; empty input is ignored.
//   feed(text) → { emit: string, hold: boolean }
//       Feed a content delta. `emit` is the string the caller must send NOW
//       ('' = nothing to emit); `hold` is true when the chunk was absorbed into
//       the held buffer and must NOT be emitted.
//         - empty text                          → { emit: '', hold: false }
//         - no reasoning seen yet               → { emit: text, hold: false }
//         - already diverged                    → { emit: text, hold: false }
//         - held + text is still a reasoning
//           prefix                              → { emit: '',  hold: true  }
//         - otherwise (DIVERGE)                 → { emit: held + text, hold: false }
//   settle() → { emit: string, suppressed: boolean }
//       Stream end. If the held buffer is non-empty (content never diverged and
//       is a byte-identical prefix of the reasoning) → suppressed=true, emit=''
//       (the held duplicate is silently dropped). Otherwise (nothing held — no
//       content, or everything already emitted) → { emit: '', suppressed: false }.
//
// Prefix checks run against the FULL accumulated reasoning string
// (seenReasoning.startsWith(candidate)), which makes the comparison incremental:
// O(candidate) per chunk, never a full-string rescan beyond the candidate
// length.

export function createStreamReasoningDedup() {
  let seenReasoning = '';
  let held = '';
  let diverged = false;

  function noteReasoning(text) {
    if (!text) return;
    seenReasoning += text;
  }

  function feed(text) {
    if (!text) return { emit: '', hold: false };
    if (!seenReasoning) return { emit: text, hold: false };
    if (diverged) return { emit: text, hold: false };
    const candidate = held + text;
    if (seenReasoning.startsWith(candidate)) {
      held = candidate;
      return { emit: '', hold: true };
    }
    // DIVERGE: release everything held so far plus this chunk in one frame,
    // then pass through untouched for the rest of the stream.
    diverged = true;
    const release = held + text;
    held = '';
    return { emit: release, hold: false };
  }

  function settle() {
    if (held) {
      held = '';
      return { emit: '', suppressed: true };
    }
    return { emit: '', suppressed: false };
  }

  return { noteReasoning, feed, settle };
}