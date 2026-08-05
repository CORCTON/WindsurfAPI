/**
 * v2.0.72 (#115 #120 root-cause workaround) — NLU intent extractor.
 *
 * Cascade upstream's `SendUserCascadeMessage` proto has no OpenAI
 * `tools[]` field. The proxy injects tool definitions into the system
 * prompt (additional_instructions_section), but GPT / GLM / Kimi
 * weren't trained on prompt-level tool-calling protocols — they see the
 * `<tool_call>{"name":...}</tool_call>` instructions, decide to call
 * the tool, but emit it as natural-language NARRATION instead of the
 * exact markup we asked for. v2.0.71 fabricate detection just flagged
 * these as failures; v2.0.72 actually RECOVERS the call.
 *
 * Real probe captures (from scripts/probes/v2071-glm-kimi-tool-probe):
 *
 *   GLM-4.7  → "I should call the shell_exec function with the command
 *               'echo HELLO_FROM_PROBE'."
 *   GLM-5.1  → "I'll run the shell command as requested."  (no args!)
 *   GPT-5.5  → "PROBE_V0270_1777751588"  (pure fabricated output)
 *
 * The first one carries enough signal to reconstruct the call; the
 * second has the intent but no args; the third is hopeless. Layered
 * extraction:
 *
 *   Layer 1 (highest confidence) — explicit invocation syntax:
 *     "Let me run shell_command(command='echo HELLO')"
 *     "function_call: shell_exec(\"echo HELLO\")"
 *
 *   Layer 2 — backtick-quoted name + value:
 *     "I'll call `shell_exec` with command `echo HELLO`"
 *     "use the `Read` function with file_path `/etc/hosts`"
 *
 *   Layer 3 — natural narrative (model "thinking out loud"):
 *     "I should call the shell_exec function with the command 'echo HI'"
 *     "Let me invoke the Read tool to read /etc/hosts"
 *
 * Each layer requires the extracted name to match a caller-declared
 * tool. Layer 3 also requires the user prompt to plausibly want a
 * tool call (shell-style verbs in the most recent user message).
 *
 * Conservative by design: false-positive tool_calls drive agent loops
 * to execute things the model didn't actually decide on. When in
 * doubt, return [].
 */

import { log } from '../config.js';

/**
 * @typedef {Object} ExtractedToolCall
 * @property {string} name        OpenAI tool name (matches caller's tools[])
 * @property {string} argumentsJson  JSON-stringified args
 * @property {'explicit-syntax'|'backtick-quoted'|'narrative'} layer
 * @property {number} confidence  0..1
 */

// v2.0.83 (audit NLU-1): the per-tool-name regex layers (Layer 2/3 and
// detectToolIntentInNarrative Pass 1) each scan the full text once PER
// declared tool, so an unbounded tools[] turns NLU recovery into
// O(N_tools × textLen) synchronous regex work — tens of thousands of tools
// × 200K text ≈ 10⁹–10¹⁰ regex ops that freeze the single-process event
// loop and DoS every tenant. Cap the number of tool names that participate
// in the scan (all three loops iterate `names`, so bounding its size bounds
// every scan). NLU recovery is best-effort, so operating on the first N
// declared tools is an acceptable degradation.
const MAX_NLU_TOOLS = 64;

/**
 * Build a Set of declared tool names + a name → primaryParamName map
 * for inference of single-arg shorthands ("with command 'echo X'" →
 * arguments.command = 'echo X').
 *
 * At most MAX_NLU_TOOLS distinct names are indexed (audit NLU-1); scanning
 * more than that per text is the polynomial blow-up we must not allow.
 */
function indexTools(tools) {
  const names = new Set();
  const primaryParam = new Map(); // tool name → first required string param
  if (!Array.isArray(tools)) return { names, primaryParam };
  for (const t of tools) {
    if (t?.type !== 'function') continue;
    const name = t.function?.name;
    if (!name || typeof name !== 'string') continue;
    names.add(name);
    const params = t.function?.parameters;
    if (params?.type === 'object' && params.properties) {
      const required = Array.isArray(params.required) ? params.required : [];
      let primary = required[0];
      // Prefer the first required string-typed param (`command`,
      // `file_path`, `query`) — that's the one models naturally
      // mention with "with command X" / "with file Y" narrative.
      for (const r of required) {
        const p = params.properties[r];
        if (p?.type === 'string') { primary = r; break; }
      }
      // Fall through to first declared property if no required ones.
      if (!primary) {
        const keys = Object.keys(params.properties || {});
        primary = keys.find(k => params.properties[k]?.type === 'string') || keys[0];
      }
      if (primary) primaryParam.set(name, primary);
    }
    // Stop once we've indexed the cap's worth of DISTINCT names. Placed at
    // the end of the body so the current tool's primaryParam is recorded
    // first. Bounds both the scan cost AND this indexing loop even when a
    // request declares tens of thousands of tools.
    if (names.size >= MAX_NLU_TOOLS) break;
  }
  return { names, primaryParam };
}

// Regex utilities — escape user-controlled tool name for regex insertion.
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// v2.0.78 (#120 follow-up + audit H-2): values extracted from narrative
// can easily be a generic noun phrase ("a shell command", "the file",
// "your input") or a literal placeholder keyword ("command",
// "argument"). Both produce garbage tool_calls — the agent loop will
// then try to execute `command` as a literal command, fail, and recurse.
// Reject these uniformly across all three layers.
const PLACEHOLDER_KEYWORDS = new Set([
  'command', 'argument', 'arguments', 'param', 'parameter',
  'parameters', 'input', 'value', 'file_path', 'filepath', 'path',
  'query', 'string', 'text', 'name', 'arg', 'output',
  // v2.0.81 (#125 — GLM-5.1 Chinese narrate): models echo Chinese
  // param-name keywords as the value too. "调用 shell_exec 命令 '命令'"
  // would otherwise produce a real tool_call with command='命令'.
  '命令', '参数', '文件', '路径', '输入', '值', '字符串', '文本', '名称', '查询', '输出',
]);
const ARTICLE_PREFIX_RE = /^(?:a|an|the|this|that|these|those|your|my|our|some|any|each|every)\s+/i;
// Chinese article-led / vague phrase prefixes — "某个命令" / "一个命令"
// / "某种参数" — same idea as ARTICLE_PREFIX_RE but for CJK.
const CN_VAGUE_PREFIX_RE = /^(?:某个?|一个|这个|那个|某种|什么|任何|每个|所有的?)/;

// ─── Non-actionable regions ────────────────────────────────────────────────
//
// WHY. Every layer below scrapes call-shaped text out of prose, and none of them
// asked whether the prose was ASSERTING the call or DISCLAIMING it. Measured on
// master with tools=[shell_exec{command}] and an actionable user prompt:
//
//   'You should never write: shell_exec("rm -rf /important")'   -> a tool call
//   'what NOT to do:\n```\nshell_exec("rm -rf /")\n```'          -> a tool call
//   'Let me run shell_exec("ls -la") now.'                       -> a tool call
//
// All three at confidence 0.85, indistinguishable. That matters more here than in
// a normal false positive, because the consumer does not re-prompt: handlers/chat.js
// REPLACES the (empty) tool_calls with the recovered ones and clears the assistant
// text, so the fabricated call is what a client that executes tool calls receives.
//
// The fix MASKS those regions with spaces instead of deleting them, so every
// layer's regex offsets stay aligned with the original text and each layer gets the
// benefit without being touched. Masking is deliberately the last step before the
// layers, not a per-match test inside each one — three call sites that each decide
// "is this negated" is how the layers drifted apart in the first place.
//
// CALIBRATION. Over-suppression is the expensive direction: this recovery exists
// because GLM/Kimi narrate instead of emitting, and it is ON BY DEFAULT for them
// (see WINDSURFAPI_NLU_RETRY). Silently declining to recover turns a working
// request into a stalled loop. So the cue must precede the call ON THE SAME CLAUSE:
// "never run shell_exec(...)" is suppressed, while "I will run X, and I will not
// touch Y" keeps X. A cue anywhere-in-the-message rule would have suppressed the
// second one too.
const NEGATION_CUE_RE = new RegExp(
  '(?:'
  + "\\b(?:never|don'?t|do\\s+not|avoid|must\\s+not|should\\s+not|shouldn'?t|cannot|can'?t|"
  + 'without|instead\\s+of|rather\\s+than|counter-?example|anti-?pattern|'
  + 'not\\s+(?:to\\s+)?(?:run|call|use|execute|invoke|write|do)|'
  + 'wrong|incorrect|bad\\s+example|what\\s+not\\s+to)\\b'
  + '|不要|不能|不可|不应|切勿|禁止|避免|错误示例|反例|而不是|请勿'
  + ')',
  'i',
);

// A clause ends at a sentence terminator or a newline. Colons and dashes do NOT
// end one: "never write: fn(...)" and "avoid this — fn(...)" are the shapes that
// actually appear, and treating ':' as a boundary would let both through.
const CLAUSE_SPLIT_RE = /[.!?;]\s|\n/;

/** Replace [start,end) with spaces, preserving length so offsets stay valid. */
function blank(text, start, end) {
  return text.slice(0, start) + text.slice(start, end).replace(/[^\n]/g, ' ') + text.slice(end);
}

/**
 * Blank out fenced code blocks and negated clauses.
 *
 * Fences are masked wholesale: a model showing a call inside ``` is illustrating,
 * not calling. That is true even when the fence has no negation cue at all — a
 * fenced example is a quotation, and the emulation protocol this repo uses puts
 * REAL calls in `<tool_call>` markup, not in prose fences.
 */
export function maskNonActionableRegions(text) {
  let out = String(text);

  // Fenced blocks, both ``` and ~~~, including an unterminated trailing fence
  // (a truncated stream ends mid-fence, and the tail is still illustrative).
  const fenceRe = /(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n?([\s\S]*?)(?:\n[ \t]*\2[ \t]*(?=\n|$)|$)/g;
  let m;
  while ((m = fenceRe.exec(out)) !== null) {
    out = blank(out, m.index, m.index + m[0].length);
    fenceRe.lastIndex = m.index + m[0].length;
  }

  // Negated clauses. Walk clause by clause so a cue only reaches its own clause.
  const parts = [];
  let cursor = 0;
  while (cursor < out.length) {
    CLAUSE_SPLIT_RE.lastIndex = 0;
    const rest = out.slice(cursor);
    const hit = rest.match(CLAUSE_SPLIT_RE);
    const end = hit ? cursor + hit.index + hit[0].length : out.length;
    parts.push([cursor, end]);
    cursor = end;
  }
  for (const [s, e] of parts) {
    const clause = out.slice(s, e);
    const cue = clause.match(NEGATION_CUE_RE);
    if (!cue) continue;
    // Only the part of the clause AFTER the cue is disclaimed. Text before it is
    // ordinary prose and may carry a genuine call.
    out = blank(out, s + cue.index, e);
  }

  return out;
}

function looksLikePlaceholderValue(value) {
  if (typeof value !== 'string' || !value.trim()) return true;
  const v = value.trim();
  // Strip trailing punctuation (`.`, `,`, `;`, `:`, `。`, `，`) before comparison.
  const stripped = v.replace(/[.,;:!?。，；：！？]+$/, '');
  if (PLACEHOLDER_KEYWORDS.has(stripped.toLowerCase())) return true;
  // Article-led phrase ("a shell command", "the file") — model
  // narrating about the call rather than supplying the call value.
  if (ARTICLE_PREFIX_RE.test(stripped)) return true;
  // Chinese vague prefix — "某个命令", "一个文件", "这个参数"
  if (CN_VAGUE_PREFIX_RE.test(stripped)) return true;
  return false;
}

/**
 * Layer 1: explicit invocation syntax.
 *
 *   shell_command(command="echo X")
 *   shell_exec("echo X")
 *   function_call: name=shell_exec args={"command":"echo X"}
 */
function extractLayer1(text, names, primaryParam) {
  const out = [];
  // function_name(arg=value) or function_name("value")
  const reExplicit = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*(?:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*)?["'`]([^"'`)]{1,2000})["'`]\s*\)/g;
  let m;
  while ((m = reExplicit.exec(text)) !== null) {
    const [, fn, paramName, value] = m;
    if (!names.has(fn)) continue;
    if (looksLikePlaceholderValue(value)) continue;
    // The positional form `fn("value")` used to emit `{_value: "..."}`. No tool
    // declares `_value`, so even a CORRECT extraction produced an argument name the
    // callee cannot bind — the recovery reported success while handing the client an
    // unusable call. Bind it to the tool's primary declared parameter instead
    // (indexTools already resolves that: first required string param, which is the
    // one narrative names — `command`, `file_path`, `query`).
    //
    // When it cannot be resolved, DROP the extraction rather than invent a name.
    // A dropped extraction falls through to the retry-with-correction path, which
    // asks the model to emit the call properly; a wrongly-named argument does not,
    // and arrives at the client looking valid. Layers 2 and 3 already refuse to
    // extract without a primaryParam, so this only aligns layer 1 with them.
    const slot = paramName || primaryParam?.get(fn);
    if (!slot) continue;
    out.push({
      name: fn,
      argumentsJson: JSON.stringify({ [slot]: value }),
      layer: 'explicit-syntax',
      // An explicitly named parameter is still stronger evidence than one we
      // inferred from the schema, so the confidence split is preserved.
      confidence: paramName ? 0.95 : 0.85,
    });
  }
  // function_call: name=X args={...}
  const reFc = /function[_\s]?call\s*[:=][^{]*?\bname\s*[:=]\s*["'`]?([A-Za-z_][A-Za-z0-9_]*)["'`]?[^{]*?(\{[\s\S]{1,2000}?\})/g;
  while ((m = reFc.exec(text)) !== null) {
    const [, fn, argsBlob] = m;
    if (!names.has(fn)) continue;
    let args = {};
    try { args = JSON.parse(argsBlob); } catch {}
    out.push({
      name: fn,
      argumentsJson: JSON.stringify(args),
      layer: 'explicit-syntax',
      confidence: 0.9,
    });
  }
  return out;
}

/**
 * Layer 2: backtick-quoted name + later backtick-quoted value.
 *
 *   "I'll call `shell_exec` with command `echo HELLO`"
 *   "use the `Read` function with file_path `/etc/hosts`"
 */
function extractLayer2(text, names, primaryParam) {
  const out = [];
  for (const fn of names) {
    const fnRe = new RegExp(`\\\`${escapeRe(fn)}\\\``, 'g');
    let m;
    while ((m = fnRe.exec(text)) !== null) {
      // Look for next backtick-quoted token within 200 chars
      const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 200);
      // Capture "with PARAM `value`" / "PARAM: `value`".
      // Do not accept a bare next backtick as the value: answers like
      // "available tools: `read`, `write`, `edit`" are capability lists,
      // not tool calls (#196).
      const argRe = /(?:with\s+)?(?:the\s+)?(?:argument|param|parameter|input|command|file[_-]?path|path|query)\s*[:=]?\s*`([^`]{1,1000})`/i;
      const a = tail.match(argRe);
      if (!a) continue;
      const value = a[1];
      if (looksLikePlaceholderValue(value)) continue;
      const param = primaryParam.get(fn) || 'input';
      out.push({
        name: fn,
        argumentsJson: JSON.stringify({ [param]: value }),
        layer: 'backtick-quoted',
        confidence: 0.8,
      });
    }
  }
  return out;
}

/**
 * Layer 3: natural narrative.
 *
 *   "I should call the shell_exec function with the command 'echo HI'"
 *   "Let me invoke the Read tool to read /etc/hosts"
 *   "I'll run shell_command with command echo HELLO"
 */
function extractLayer3(text, names, primaryParam) {
  const out = [];
  // v2.0.81 (#125 DuZunTianXia): GLM-5.1 narrate in Chinese — log
  // showed "让我用 Bash 来列出..." / "用户想查看..." / "我会调用 X
  // 工具" — none of which the English-only verb regex picked up.
  // Add Chinese verbs alongside English so the name pattern matches
  // either language (or mixed). The primary tool-name match still
  // requires the literal tool name (e.g. `Bash`, `shell_exec`) since
  // those are emitted in the original alphabet by every model.
  const verbs = '(?:call|invoke|run|use|execute|exec|trigger|fire'
    + '|调用|使用|运行|执行|触发|启动|让我用|让我使用|我会用|我将用|通过|借助|采用)';
  const articles = '(?:the\\s+)?';
  // Suffix matches ONLY tool/function meta-words (not arg labels like
  // "command" / "命令") so the latter stay in the tail and feed the
  // argPatterns. Pre-v2.0.81 it included "command" / "命令" which
  // greedily consumed the very keyword that argPattern 2/4 needs.
  const suffix = '(?:\\s+(?:function|tool|method|函数|工具|方法))?';
  for (const fn of names) {
    // Pattern: "<verb> [the] [function|tool] <fn> [function|tool]"
    // \b doesn't match between Chinese and Latin, so we drop the
    // leading word boundary and rely on the verb list itself.
    const namePat = new RegExp(
      `${verbs}\\s*${articles}(?:function|tool|method|函数|工具|方法)?\\s*\\\`?${escapeRe(fn)}\\\`?${suffix}`,
      'gi',
    );
    let m;
    while ((m = namePat.exec(text)) !== null) {
      // Hunt for value within next 300 chars
      const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 300);
      // ordered by specificity:
      const argPatterns = [
        // with the command 'echo X' / with command "echo X" / with command `echo X`
        /\bwith\s+(?:the\s+)?(?:command|argument|param(?:eter)?|input|file[_-]?path|path|query)\s+["'`]([^"'`\n]{1,500})["'`]/i,
        // bare keyword + value (no "with"): command 'echo X' / argument "X"
        /(?:^|\s)(?:command|argument|param(?:eter)?|input|file[_-]?path|path|query)\s+["'`]([^"'`\n]{1,500})["'`]/i,
        // 中文：用命令 'X' / 传入 'X' / 参数 'X' / 命令 'X' / 路径 'X'
        /(?:用|使用|传入|输入|参数(?:为)?|命令(?:为)?|路径(?:为)?|文件(?:为)?|查询(?:为)?)\s*["'`「『]([^"'`\n「」『』]{1,500})["'`」』]/,
        // with 'echo X' (no param keyword)
        /\bwith\s+["'`]([^"'`\n]{1,500})["'`]/i,
        // to read /etc/hosts (positional after action verb)
        /\bto\s+(?:read|run|execute|view|search|find|cat|ls)\s+([\S][^\n]{0,200})/i,
        // : 'echo X' / = 'echo X'
        /[:=]\s*["'`]([^"'`\n]{1,500})["'`]/,
        // last resort: very first quoted string in the tail
        /^[\s,，。.]*["'`「『]([^"'`\n「」『』]{1,500})["'`」』]/,
      ];
      let value = null;
      for (const pat of argPatterns) {
        const a = tail.match(pat);
        if (a && a[1]) { value = a[1].trim(); break; }
      }
      if (!value) continue;
      // v2.0.76 + v2.0.78 (audit H-2): reject placeholder keywords
      // (`command` / `argument` / ...) AND article-led prose phrases
      // (`a shell command` / `the file` / `your input`). GLM-4.7
      // narrative reproducer "to run a shell command" was capturing
      // "a shell command." as the value pre-v2.0.78 even with the
      // single-word filter in place.
      if (looksLikePlaceholderValue(value)) continue;
      const param = primaryParam.get(fn) || 'input';
      out.push({
        name: fn,
        argumentsJson: JSON.stringify({ [param]: value }),
        layer: 'narrative',
        confidence: 0.65,
      });
    }
  }
  return out;
}

/**
 * Detect whether the user prompt asked for an action a function could
 * perform. Layer 3 (narrative) only fires when this is true to avoid
 * false-positive tool_call extraction from casual chat.
 */
function userPromptLooksActionable(lastUserText) {
  if (!lastUserText) return false;
  // v2.0.81 (#125): widen to Chinese verbs/nouns so GLM-5.1 / Kimi
  // running with a Chinese system prompt + Chinese user turn still
  // routes through Layer 3.
  if (/\b(?:run|exec|execute|cat|ls|echo|grep|find|read|search|list|invoke|call|fetch|get|fix|edit|write|patch)\b/i.test(lastUserText)) return true;
  if (/\b(?:shell|bash|terminal|command|tool|function|file|path)\b/i.test(lastUserText)) return true;
  if (/(?:运行|执行|读取|查看|列出|查找|搜索|获取|修改|编辑|写入|修复|分析|调用|使用|拉取|下载|找到|看一下|看看|检查)/.test(lastUserText)) return true;
  if (/(?:文件|目录|路径|命令|工具|函数|参数|项目|代码|配置)/.test(lastUserText)) return true;
  return false;
}

/**
 * Detect whether the model's narrative looks like it INTENDED to call
 * a tool but never produced a usable extraction. Used to gate the
 * retry-with-correction loop in chat.js — we only burn an extra
 * cascade round-trip when there's clear tool intent we couldn't
 * recover.
 *
 * Returns one of:
 *   - the matched declared tool name (when the model named it inline)
 *   - the FIRST declared tool name (when the narrative shows clear
 *     action intent + user actionable prompt + an action verb,
 *     even if the model didn't name a specific tool — GLM-5.1 will
 *     say "Let me list the files" without saying "Bash")
 *   - null when there's no usable signal
 *
 * v2.0.82 (#125 — proper translator layer beyond NLU).
 */
export function detectToolIntentInNarrative(text, tools, opts = {}) {
  if (typeof text !== 'string' || !text.trim()) return null;
  // ReDoS/CPU bound (audit #3): this scans the full text once per declared
  // tool name, so a pathologically large model output could drive the
  // per-name regex loop into a polynomial blow-up. Cap the scanned length;
  // NLU recovery is best-effort so operating on a prefix is acceptable.
  if (text.length > 200_000) text = text.slice(0, 200_000);
  if (!Array.isArray(tools) || !tools.length) return null;
  const lastUserText = opts.lastUserText || '';
  if (!userPromptLooksActionable(lastUserText)) return null;
  const { names } = indexTools(tools);
  if (!names.size) return null;
  // Same masking as the extractor: a tool named ONLY inside a disclaimer or a
  // fenced counter-example is not intent, and this function's answer decides
  // whether to spend an extra upstream round-trip telling the model to emit it.
  // Gating one of the two entry points would leave the retry loop chasing a call
  // the model explicitly said not to make.
  text = maskNonActionableRegions(text);
  // Verb forms (English + Chinese) that signal "I'm about to call X".
  const verbPattern = /\b(?:call|invoke|run|use|execute|exec|trigger|fire|going to|will|let me|i'?ll|i'?m going|need to|should)\b|(?:调用|使用|运行|执行|触发|启动|让我|我会|我将|准备|打算|想要|需要|应该)/i;
  if (!verbPattern.test(text)) return null;
  // Action keywords (file ops, search, read, etc.) — these stand in
  // for "the model is talking about USING tools generically".
  const actionVerbPattern = /\b(?:list|show|read|cat|grep|find|search|view|fetch|get|create|write|edit|run|execute|check|inspect|examine|analyz|browse|explore)\b|(?:列出|展示|读取|查看|查找|搜索|获取|拉取|下载|创建|写入|编辑|运行|执行|检查|检视|分析|浏览|探索|看一下|看看)/i;
  // Pass 1: specific tool name in narrative (most precise).
  for (const fn of names) {
    const fnRe = new RegExp(`\\b${escapeRe(fn)}\\b|\\\`${escapeRe(fn)}\\\``);
    if (fnRe.test(text)) return fn;
  }
  // Pass 2: action keyword present (model said "let me list..." but
  // didn't name the tool). Return the first declared tool — caller's
  // correction prompt will name it explicitly so the retry knows
  // which tool to emit.
  if (actionVerbPattern.test(text)) return [...names][0];
  return null;
}

/**
 * Top-level extractor. Returns a deduped, confidence-sorted list of
 * extracted tool_calls. Empty array when nothing is recoverable.
 *
 * Set the `WINDSURFAPI_NLU_RECOVERY=0` env to turn off entirely
 * (default ON).
 */
export function extractIntentFromNarrative(text, tools, opts = {}) {
  if (process.env.WINDSURFAPI_NLU_RECOVERY === '0') return [];
  if (typeof text !== 'string' || !text.trim()) return [];
  // ReDoS/CPU bound (audit #3, see detectToolIntentInNarrative): cap the
  // scanned length before the per-tool-name regex layers run.
  if (text.length > 200_000) text = text.slice(0, 200_000);
  if (!Array.isArray(tools) || !tools.length) return [];
  const lastUserText = opts.lastUserText || '';
  const minConfidence = typeof opts.minConfidence === 'number' ? opts.minConfidence : 0.65;
  // v2.0.78 (audit H-4): structural markers MAY indicate a malformed
  // protocol attempt — Layer 3 narrative around it tends to be
  // descriptive prose, not args. v2.0.79 narrowed the gate after
  // GLM-4.7 e2e probe regressed: GLM emits `markers=bare_json`
  // (because thinking text contains JSON-shaped fragments) AND a
  // legitimate narrate; Layer 3 is exactly what catches the narrate.
  // Now we only skip Layer 3 for `xml_tag` (Claude's tool_use shape)
  // — that's where parser-failure → Layer 3 most often produces
  // false positives. fenced_json / bare_json / openai_native still
  // allow Layer 3 because models emitting those shapes (GLM, Kimi,
  // some GPT) also reliably narrate the call in surrounding prose.
  const markers = Array.isArray(opts.markers) ? opts.markers : [];
  const skipLayer3 = markers.includes('xml_tag') && !markers.includes('natural_lang');

  const { names, primaryParam } = indexTools(tools);
  if (!names.size) return [];

  // Mask disclaimed regions ONCE, before any layer runs. Offsets are preserved
  // (regions become spaces), so every layer's regex behaves as before on the prose
  // that is actually asserting something.
  const candidate = maskNonActionableRegions(text);

  const all = [
    ...extractLayer1(candidate, names, primaryParam),
    ...extractLayer2(candidate, names, primaryParam),
    ...(!skipLayer3 && userPromptLooksActionable(lastUserText) ? extractLayer3(candidate, names, primaryParam) : []),
  ];
  if (!all.length) return [];

  // Dedupe by (name, argumentsJson). Keep the highest-confidence pick.
  const byKey = new Map();
  for (const tc of all) {
    if (tc.confidence < minConfidence) continue;
    const key = `${tc.name}::${tc.argumentsJson}`;
    const existing = byKey.get(key);
    if (!existing || tc.confidence > existing.confidence) byKey.set(key, tc);
  }
  const recovered = [...byKey.values()].sort((a, b) => b.confidence - a.confidence);
  if (recovered.length) {
    log.info(`NLU recovery: extracted ${recovered.length} tool_call(s) from narrative — ${recovered.map(t => `${t.name}@${t.layer}/${t.confidence.toFixed(2)}`).join(', ')}${skipLayer3 ? ' (layer3-skipped: structural markers seen)' : ''}`);
  }
  return recovered;
}
