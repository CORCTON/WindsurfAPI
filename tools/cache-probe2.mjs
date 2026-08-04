// cache-probe2.mjs — кэш-эмпирика на реалистичном префиксе (~30KB) (Приложение B)
import http from 'node:http';
import { readFileSync } from 'node:fs';
const PORT = Number(process.env.PORT || 3102);
const MODEL = process.env.MODEL || 'swe-1-7';
const envTxt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const KEY = process.env.API_KEY || (envTxt.match(/^API_KEY=(.+)$/m) || [])[1]?.trim();
const CONT = '\n[Continuity checkpoint — prior analysis trace]\nDigest of prior reasoning tail.\n[End]';
const SYS = 'You are a senior code reviewer. Be concise.';
const TOOLS = [{ type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }];

// ~30KB user turn (детерминированный)
const pad = 'function analyze(node){ return node.kind === "call" ? node.args.length : 0; } '.repeat(350);
const USER = 'Review the following code thoroughly and list issues:\n' + pad + '\nList the top issues briefly.';
const ASS = 'Top issues: 1) no null-check on node.args; 2) magic number; 3) missing return type.';

function request({ system, tag }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, stream: true, messages: [{ role: 'system', content: system }, { role: 'user', content: USER }, { role: 'assistant', content: ASS }, { role: 'user', content: 'And one more pass: anything else?' }], tools: TOOLS });
    const t0 = Date.now(); let ttfb = null; let text = '';
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/v1/chat/completions', method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` } }, (res) => {
      res.on('data', (c) => { if (ttfb == null && c.length) ttfb = Date.now() - t0; text += c; });
      res.on('end', () => resolve({ tag, ttfb, total: Date.now() - t0 }));
    });
    req.on('error', reject); req.end(body);
  });
}

const runs = [];
for (const [tag, system] of [['1-cold', SYS], ['2-identical-repeat', SYS], ['3-system-grow', SYS + CONT], ['4-grow-repeat', SYS + CONT]]) {
  const r = await request({ system, tag }); runs.push(r);
  console.log(`${r.tag}: ttfb=${r.ttfb}ms total=${r.total}ms`);
}
console.log('RESULTS ' + JSON.stringify(runs));
