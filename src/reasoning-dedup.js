// Protocol-agnostic verbatim reasoning/content dedup (Thinking-core T4 root).
//
// The upstream behind devin-connect can deliver the reasoning twice in one
// response: first as reasoning tokens, then again verbatim as content. Agentic
// clients that see both repeat themselves — one of the documented degradation
// forms. This helper is the single decision point for the STREAMING paths of
// every egress protocol (openai chat, anthropic messages, gemini, responses all
// consume the unified stream built around it in chat.js):
//
//   - reasoning deltas are noted as they pass (they stream live — buffering
//     thinking is a mission anti-pattern, long self-reflection runs must stay
//     interactive), so by the time content arrives it is the only side still
//     suppressible;
//   - content deltas are therefore held while reasoning is part of the
//     response, and settle() flushes them unless they are a verbatim duplicate
//     of the accumulated reasoning.
//
// Non-stream paths have free choice and keep the TEXT (the actionable channel)
// instead — see toChatCompletion's reasoning_content guard. Both policies are
// deliberate and documented in the Thinking-core design doc.
export function createStreamReasoningDedup() {
  let seenReasoning = '';
  let held = null; // null = nothing held; '' = held an empty/verbatim verdict pending
  return {
    noteReasoning(text) { if (text) seenReasoning += text; },
    // Returns the text to emit now ('' = held back for the settle verdict).
    holdOrPass(text) {
      if (!text) return '';
      if (!seenReasoning) return text; // content before any reasoning: pass through
      held = (held || '') + text;
      return '';
    },
    // At stream end: flush the held content unless it duplicates the reasoning.
    settle() {
      if (held == null) return '';
      const flush = held !== seenReasoning ? held : '';
      held = null;
      return flush;
    },
  };
}
