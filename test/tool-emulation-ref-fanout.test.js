// $ref inlining in the schema-compact preamble had a CYCLE check but no size
// bound. A cycle check does not bound a DAG: a $ref repeated in several SIBLING
// positions is never on its own ancestor chain, so a diamond fans out as
// branch^depth with no cycle in the input at all.
//
// Measured on master c3ac2b2 (schema: $defs L0..Lk, each Li with two properties
// both {$ref:'#/$defs/L(i+1)'}), calling the only caller directly:
//   levels=20  1.9 KB in -> 18193 ms,  61.9 MB out
//   levels=22  2.1 KB in -> 37275 ms, 247.5 MB out
// Node is single-threaded, so those seconds block every other tenant. And it was
// silent: applyToolPreambleBudget measures the multi-megabyte string, discards it
// for a lower tier, and returns ok=true on 'skinny' with no log line at all.
//
// These tests bound the OUTPUT (node count / bytes / placeholder shape / the
// warning) rather than wall clock, because a timing assertion is inflated by
// suite load for the correct and the broken path alike — this repo has been
// bitten (AUDIT-LEDGER round 4, a TTL assertion red 3 times under load). The one
// timing assertion here is a deliberately generous order-of-magnitude bound.
//
// Depths are chosen so that a run with the bound REMOVED still finishes and does
// not OOM the test process: levels=14 is the cheapest depth that exhausts the
// budget (measured), and only two tests use the 61.9 MB headline input.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchemaCompactToolPreambleForProto } from '../src/handlers/tool-emulation.js';
import { log } from '../src/config.js';

// The bound in src is 50000 traversal steps. A $ref node spends one step for
// itself and one for the body it expands into, so the OUTPUT node count lands
// near half of that; 50000 is the honest upper bound to assert against.
const NODE_BUDGET = 50000;
// Cheapest depth that still exhausts the budget (measured: 13 does not, 14 does).
const EXHAUSTS = 14;
// The depth the defect was measured at: 18193 ms / 61.9 MB before the fix.
const HEADLINE = 20;

/** $defs L0..Lk, each level referenced from two sibling positions. No cycles. */
function fanoutSchema(levels) {
  const $defs = {};
  for (let i = 0; i <= levels; i++) {
    if (i === levels) { $defs[`L${i}`] = { type: 'string' }; continue; }
    $defs[`L${i}`] = {
      type: 'object',
      properties: {
        a: { $ref: `#/$defs/L${i + 1}` },
        b: { $ref: `#/$defs/L${i + 1}` },
      },
    };
  }
  return { type: 'object', $defs, properties: { root: { $ref: '#/$defs/L0' } } };
}

function fanoutTool(levels, name = 'fanout') {
  return { type: 'function', function: { name, parameters: fanoutSchema(levels) } };
}

function paramsOf(preamble, name = 'fanout') {
  const section = preamble.split(`### ${name}\n`)[1];
  assert.ok(section, `preamble has no "### ${name}" section`);
  const m = section.match(/^Params: (.+)$/m);
  assert.ok(m, `tool ${name} emitted no Params line`);
  return JSON.parse(m[1]);
}

function countNodes(v) {
  if (!v || typeof v !== 'object') return 0;
  if (Array.isArray(v)) return v.reduce((n, x) => n + countNodes(x), 0);
  return 1 + Object.values(v).reduce((n, x) => n + countNodes(x), 0);
}

/** Build a preamble while capturing log.warn, so exhaustion is assertable. */
function build(tools) {
  const warns = [];
  const original = log.warn;
  log.warn = (...args) => { warns.push(args.join(' ')); };
  try {
    return { preamble: buildSchemaCompactToolPreambleForProto(tools, 'auto'), warns };
  } finally {
    log.warn = original;
  }
}

describe('schema-compact $ref inlining — global node budget on sibling fan-out', () => {
  it('bounds output node count for the cycle-free diamond that used to reach 61.9 MB', () => {
    const { preamble } = build([fanoutTool(HEADLINE)]);
    const nodes = countNodes(paramsOf(preamble));
    assert.ok(nodes > 0, 'schema must not be empty');
    assert.ok(nodes <= NODE_BUDGET,
      `inlined ${nodes} nodes, bound is ${NODE_BUDGET} — the fan-out is unbounded again`);
    // 61.9 MB was the pre-fix output for this exact input. Bound the blow-up, not
    // today's incidental byte count.
    const bytes = Buffer.byteLength(preamble, 'utf8');
    assert.ok(bytes < 2_000_000, `preamble is ${bytes} B; the defect produced 61.9 MB here`);
  });

  it('output stops growing with depth once the budget binds', () => {
    const sizes = [EXHAUSTS, 16, 18].map((levels) => {
      const { preamble } = build([fanoutTool(levels)]);
      return { levels, nodes: countNodes(paramsOf(preamble)), bytes: Buffer.byteLength(preamble, 'utf8') };
    });
    for (const s of sizes) {
      assert.ok(s.nodes <= NODE_BUDGET, `levels=${s.levels} inlined ${s.nodes} nodes (bound ${NODE_BUDGET})`);
    }
    // Pre-fix, each extra level DOUBLED the output (61.9 MB -> 247.5 MB over two
    // levels). The bound must make depth irrelevant, not merely "smaller".
    const bytes = sizes.map((s) => s.bytes);
    assert.ok(Math.max(...bytes) / Math.min(...bytes) < 1.1,
      `output still scales with depth: ${sizes.map((s) => `L${s.levels}=${s.bytes}B`).join(' ')}`);
  });

  it('the budget is shared across the build, so N fan-out tools cost about one', () => {
    const { preamble: one } = build([fanoutTool(EXHAUSTS)]);
    const many = Array.from({ length: 12 }, (_, i) => fanoutTool(EXHAUSTS, `f${i}`));
    const { preamble: all } = build(many);
    const oneBytes = Buffer.byteLength(one, 'utf8');
    const allBytes = Buffer.byteLength(all, 'utf8');
    // A per-tool budget would multiply by 12 here — the same event-loop stall
    // wearing a different hat.
    assert.ok(allBytes < oneBytes * 2,
      `12 fan-out tools produced ${allBytes} B vs ${oneBytes} B for one — the budget is per tool, not per build`);
    // Every tool must still be listed; only schema subtrees degrade.
    for (const t of many) assert.ok(all.includes(`### ${t.function.name}`), `tool ${t.function.name} vanished`);
  });

  it('exhaustion is observable: one warning naming the offending tool and the budget', () => {
    // 'Innocent' comes after the fan-out and is truncated only because the budget
    // was already gone. Naming it would send the operator to the wrong schema.
    const innocent = { type: 'function', function: { name: 'Innocent', parameters: { type: 'object', properties: { q: { type: 'string' } } } } };
    const { warns } = build([fanoutTool(EXHAUSTS, 'Diamond'), innocent]);
    assert.equal(warns.length, 1, `expected exactly one warning, got ${warns.length}: ${warns.join(' | ')}`);
    assert.match(warns[0], /Diamond/, 'warning must name the tool whose schema exhausted the budget');
    assert.equal(/Innocent/.test(warns[0]), false, 'warning must not blame a tool that merely came after the fan-out');
    assert.match(warns[0], /50000/, 'warning must state the budget that was hit');
  });

  it('truncated subtrees degrade to the placeholder cycles already use, never a dangling $ref', () => {
    const { preamble } = build([fanoutTool(EXHAUSTS)]);
    const raw = preamble.match(/^Params: (.+)$/m)[1];
    assert.equal(raw.includes('$ref'), false, 'truncation must not leave a $ref with no $defs to resolve it');
    assert.equal(raw.includes('$defs'), false, 'output must not retain $defs');
    assert.ok(raw.includes('{"type":"object"}'), 'exhausted subtrees must degrade to the {type:object} placeholder');
  });

  it('keywords reached after exhaustion degrade, and an array keyword stays an ARRAY', () => {
    // `properties` is traversed before its siblings (insertion order), so `big`
    // exhausts the budget and everything after it is entered with nothing left.
    // That makes this the one input where the budget's plumbing into each
    // recursion site is observable. Replacing an exhausted ARRAY wholesale with
    // the object placeholder would emit `"anyOf":{...}`, which is not valid JSON
    // Schema — so the bound is charged to an array's object ELEMENTS, never to
    // the array node itself.
    const tools = [{
      type: 'function',
      function: {
        name: 'TailArray',
        parameters: {
          type: 'object',
          properties: { big: { $ref: '#/$defs/L0' } },
          anyOf: [{ type: 'string' }, { type: 'number' }],
          additionalProperties: { type: 'string' },
          $defs: fanoutSchema(EXHAUSTS).$defs,
        },
      },
    }];
    const { preamble, warns } = build(tools);
    assert.equal(warns.length, 1, 'this input is meant to exhaust the budget');
    const schema = paramsOf(preamble, 'TailArray');
    assert.ok(Array.isArray(schema.anyOf), `anyOf must remain an array, got ${JSON.stringify(schema.anyOf).slice(0, 60)}`);
    assert.equal(schema.anyOf.length, 2, 'both branches must survive as entries');
    // Past the boundary, so each branch is the placeholder. This is also what
    // proves the assertion above ran on the exhausted path rather than an
    // in-budget one — and that the budget reaches the array-keyword and
    // additionalProperties recursions rather than each getting a fresh one.
    assert.deepEqual(schema.anyOf, [{ type: 'object' }, { type: 'object' }]);
    assert.deepEqual(schema.additionalProperties, { type: 'object' });
  });

  it('completes in well under the pre-fix 18.2 s (generous order-of-magnitude bound)', () => {
    const t0 = process.hrtime.bigint();
    build([fanoutTool(HEADLINE)]);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    // Measured 30-50 ms after the fix, 18193 ms before. 5000 ms leaves two orders
    // of magnitude of headroom for suite load.
    assert.ok(ms < 5000, `took ${ms.toFixed(0)} ms; pre-fix this input took 18193 ms`);
  });
});

describe('schema-compact $ref inlining — negative control: in-budget schemas untouched', () => {
  it('a legitimate multi-level schema with repeated sibling $refs inlines completely', () => {
    // ~1000 nodes: comfortably inside the budget, and every leaf must be the real
    // leaf type rather than a placeholder.
    const { preamble, warns } = build([fanoutTool(9, 'Modest')]);
    assert.deepEqual(warns, [], 'a schema inside the budget must not warn');
    const schema = paramsOf(preamble, 'Modest');

    // Walk the all-"b" path to the deepest leaf: it must be the declared string
    // leaf, i.e. inlining ran to completion on that branch.
    let cur = schema.properties.root;
    for (let i = 0; i < 9; i++) {
      assert.equal(cur.type, 'object', `level ${i} lost its object type`);
      cur = cur.properties.b;
      assert.ok(cur, `level ${i} lost its "b" branch to truncation`);
    }
    assert.equal(cur.type, 'string', 'the deepest leaf was replaced by a placeholder');

    // And nothing anywhere else was dropped: compare against an independent
    // expansion with no bound at all.
    const src = fanoutSchema(9);
    assert.equal(countNodes(schema), countNodes(expandUnbounded(src, src)),
      'output node count differs from the complete expansion — a subtree was dropped');
  });

  it('an ordinary Read/MultiEdit-shaped tool set keeps every $ref site fully inlined', () => {
    const tools = [
      { type: 'function', function: { name: 'Read', description: 'Read a file.', parameters: { type: 'object', properties: { file_path: { type: 'string', description: 'path' } }, required: ['file_path'] } } },
      { type: 'function', function: { name: 'MultiEdit', description: 'Edit a file.', parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
          edits: { type: 'array', items: { $ref: '#/$defs/Edit' } },
          fallback: { anyOf: [{ $ref: '#/$defs/Edit' }, { type: 'null' }] },
        },
        required: ['file_path', 'edits'],
        $defs: { Edit: { type: 'object', properties: { old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['old_string', 'new_string'], additionalProperties: false } },
      } } },
    ];
    const { preamble, warns } = build(tools);
    assert.deepEqual(warns, [], 'ordinary tools must not warn');
    const multi = paramsOf(preamble, 'MultiEdit');
    // Both $ref sites — one under `items`, one inside an anyOf ARRAY — fully
    // inlined, and the anyOf is still an array.
    assert.equal(multi.properties.edits.items.properties.old_string.type, 'string');
    assert.equal(multi.properties.edits.items.additionalProperties, false);
    assert.ok(Array.isArray(multi.properties.fallback.anyOf), 'anyOf must remain an array');
    assert.equal(multi.properties.fallback.anyOf[0].properties.new_string.type, 'string');
    assert.equal(multi.properties.fallback.anyOf[1].type, 'null');
    assert.equal(JSON.stringify(multi).includes('$ref'), false);
    assert.equal(multi.properties.file_path.type, 'string');
  });
});

/**
 * Reference expansion of local $refs with a cycle guard and NO size bound — what
 * src did before the budget. Used only to pin that an in-budget schema still
 * expands to exactly the same number of nodes as it always did.
 */
function expandUnbounded(node, root, stack = []) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((n) => expandUnbounded(n, root, stack));
  if (typeof node.$ref === 'string') {
    if (stack.includes(node.$ref)) return { type: 'object' };
    let cur = root;
    for (const p of node.$ref.slice(2).split('/')) cur = cur?.[p];
    if (!cur || typeof cur !== 'object') return { type: 'object' };
    const siblings = Object.fromEntries(Object.entries(node).filter(([k]) => k !== '$ref'));
    return expandUnbounded({ ...cur, ...siblings }, root, [...stack, node.$ref]);
  }
  const KEEP = new Set(['type', 'enum', 'properties', 'items', 'required', 'oneOf', 'anyOf', 'allOf', 'const', 'format', 'additionalProperties']);
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (!KEEP.has(k)) continue;
    if (k === 'properties' && v && typeof v === 'object') {
      out[k] = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, expandUnbounded(pv, root, stack)]));
    } else if ((k === 'items' || k === 'oneOf' || k === 'anyOf' || k === 'allOf') && v) {
      out[k] = expandUnbounded(v, root, stack);
    } else if (k === 'additionalProperties') {
      if (v === false) out[k] = false;
      else if (v && typeof v === 'object') out[k] = expandUnbounded(v, root, stack);
    } else {
      out[k] = v;
    }
  }
  return out;
}
