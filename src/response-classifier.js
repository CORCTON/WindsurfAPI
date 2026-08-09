// Response-content classifier (Thinking-core item 2, applied in item 1).
//
// Purpose: decide which parts of a streamed answer are *reasoning* vs *actionable
// text*, so misrouted content can be corrected at the egress and self-reinforcing
// loops can be broken.
//
// Degradation addressed: the model sometimes emits its reasoning through the CONTENT
// channel wrapped in its native markers. The client stores that as visible assistant
// text and resends it next turn, re-priming more reasoning-as-text — the loop.
//
// This module detects the markers in the content stream and lets the egress reroute
// the marked spans to the thinking channel (which clients do not resend), breaking the
// loop. Scope: a LEADING reasoning block only (marker at the very start, optional
// whitespace before it). No synthetic signatures, no router reliance, no guesses about
// unmarked or mid-answer content. Handles markers split across stream deltas.

const THINK_OPEN = '<' + 'think' + '>';
const THINK_CLOSE = '<' + '/' + 'think' + '>';

const MAX_PENDING = 32000; // hold ceiling for an unterminated think span
const MAX_LEAD = 8192;     // undecided-hold ceiling before committing to text


export class ThinkTextClassifier {
  constructor() {
    this.pending = '';
    this.mode = 'undecided'; // undecided | text | think
  }

  // Feed a content delta; returns { text, thinking } — slices to emit on each channel
  // right now ('' when nothing is due).
  //
  // think/undecided share one explicit loop so a chain of blocks inside a single delta
  // is processed iteratively. The original mutual recursion (_feedThink -> _feedUndecided
  // -> _feedThink -> ...) grew one stack frame per stacked block and threw a RangeError
  // at a few thousand of them; MAX_PENDING does not bound that, since it only caps a
  // single unterminated span, not a chain of closed ones.
  feed(delta) {
    if (!delta) return { text: '', thinking: '' };
    if (this.mode === 'text') return { text: delta, thinking: '' };

    let rest = delta;
    let text = '';
    let thinking = '';

    while (true) {
      // Each helper scans `this.pending`, so the remainder of a closed block (or the
      // original delta) is folded in at the top of every iteration.
      this.pending += rest;
      rest = '';

      if (this.mode === 'think') {
        const s = this._scanThink();
        if (s.text !== undefined) return { text: s.text, thinking }; // MAX_PENDING dump
        if (s.hold) return { text, thinking };  // buffer until the close marker proves it
        thinking += s.span;                     // closed block -> reroute its reasoning
        rest = s.rest;                          // re-scan the remainder this same delta
        continue;
      }

      const u = this._scanUndecided();
      if (u.toThink) continue;                  // leading marker -> think mode, same delta
      if (u.text !== undefined) {
        return { text: text + u.text, thinking }; // committed as text (inline / overflow)
      }
      return { text, thinking };                // hold: may still grow into a marker
    }
  }

  // Scan an undecided buffer for a decision. Returns either a completed result (the
  // caller returns it), `{ toThink: true }` to hand the remainder after a leading
  // marker to think mode, or `{ toThink: false }` to hold. Never recurses.
  _scanUndecided() {
    const oi = this.pending.indexOf(THINK_OPEN);
    if (oi >= 0) {
      if (this.pending.slice(0, oi).trim() === '') {
        // Leading marker -> enter think mode; drop whitespace-only prefix.
        this.mode = 'think';
        this.pending = this.pending.slice(oi + THINK_OPEN.length);
        return { toThink: true }; // process the remainder of this same delta
      }
      // Marker present but real text precedes it -> inline, not a leak.
      return this._commitText();
    }

    // Enough held without a decision -> it is plain text; commit. This check
    // MUST run after the marker scan (not before): MAX_LEAD is a cap on undecided
    // *content* that proves it is text, not a budget that lets an early overflow
    // dump a leading think block to the text channel before the scan ever runs.
    if (this.pending.length > MAX_LEAD) return this._commitText();

    // No full marker yet. Could the pending still grow into one?
    const core = this.pending.replace(/^\s+/, '');
    if (core.length === 0) return { toThink: false }; // only whitespace so far
    if (THINK_OPEN.startsWith(core)) return { toThink: false }; // partial marker
    return this._commitText(); // definitively not a leading marker
  }

  _commitText() {
    const out = this.pending;
    this.pending = '';
    this.mode = 'text';
    return { text: out, thinking: '' };
  }

  // Scan a think-mode buffer for a closing marker. Returns `{ hold: true }` to keep
  // buffering, `{ text, thinking }` for the MAX_PENDING dump-as-text escape, or
  // `{ span, rest }` for a closed block — the caller re-scans `rest` in the same
  // iteration, so a chain of blocks never nests another call.
  _scanThink() {
    const ci = this.pending.indexOf(THINK_CLOSE);
    if (ci >= 0) {
      const span = this.pending.slice(0, ci);
      const rest = this.pending.slice(ci + THINK_CLOSE.length);
      this.pending = '';
      this.mode = 'undecided'; // may catch a following block; normal text commits
      return { span, rest };
    }

    if (this.pending.length > MAX_PENDING) {
      // Pathological unterminated span -> deliver as text (visible beats dropped,
      // and loop-break value is gone at this size anyway).
      const dump = this.pending;
      this.pending = '';
      this.mode = 'text';
      return { text: dump, thinking: '' };
    }

    return { hold: true }; // buffer until the close marker proves it
  }

  // Stream end: flush whatever is held. Undecided content is text; an unterminated
  // think span is NOT rerouted (it never proved it was reasoning) — delivered as text.
  flush() {
    const out = this.pending;
    this.pending = '';
    this.mode = 'text';
    return out;
  }
}

export const THINK_MARKERS = { open: THINK_OPEN, close: THINK_CLOSE };
