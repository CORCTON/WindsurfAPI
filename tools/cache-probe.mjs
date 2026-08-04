// cache-probe.mjs — эмпирика префикс-кэша upstream через windsurf-api (Приложение B гоал-файла)
// Фазы: A — append-only история (T1..T4, затем повтор T4 идентичными байтами);
//       B — тот же диалог, но system с растущим суффиксом (имитация continuity-блока).
// Метрика: TTFB (мс) на стриме. Запуск: node tools/cache-probe.mjs (PORT, MODEL, API_KEY из env).
import http from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.PORT || 3102);
const MODEL = process.env.MODEL || 'swe-1-7';
const envTxt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const KEY = process.env.API_KEY || (envTxt.match(/^API_KEY=(.+)$/m) || [])[1]?.trim();
const CONT = '\n[Continuity checkpoint — prior analysis trace]\nSome prior reasoning digest.\n[End]';

const TOOLS = [{ type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }];
const USER = [
  'You are reviewing a codebase. Turn 1: briefly list three code-quality checks you would run.',
  'Turn 2: pick the first check and describe how you would automate it.',
  'Turn 3: now sketch a one-paragraph plan to roll it out.',
  'Turn 4: summarize the plan in two sentences.',
];

function request({ messages, system, tag }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, stream: true, messages: [{ role: 'system', content: system }, ...messages], tools: TOOLS });
    const t0 = Date.now();
    let ttfb = null; let text = '';
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/v1/chat/completions', method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` } }, (res) => {
      res.on('data', (c) => { if (ttfb == null && c.length) ttfb = Date.now() - t0; text += c; });
      res.on('end', () => {
        const lines = text.split('\n').filter((l) => l.startsWith('data:') && !l.includes('[DONE]'));
        let content = '';
        for (const l of lines) { try { const d = JSON.parse(l.slice(5)); content += d.choices?.[0]?.delta?.content || ''; } catch {} }
        resolve({ tag, ttfb, total: Date.now() - t0, chars: content.length });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

const SYS = 'You are a senior code reviewer. Be concise.';
const results = [];
const hist = [];
console.log('phase A: append-only session');
for (let i = 0; i < USER.length; i++) {
  const r = await request({ messages: [...hist, { role: 'user', content: USER[i] }], system: SYS, tag: `A-turn${i + 1}` });
  results.push(r);
  hist.push({ role: 'user', content: USER[i] }, { role: 'assistant', content: 'ok: ' + (r.chars || 1) });
  console.log(`  ${r.tag}: ttfb=${r.ttfb}ms total=${r.total}ms`);
}
{ const r = await request({ messages: [...hist.slice(0, -2), { role: 'user', content: USER[3] }], system: SYS, tag: 'A-repeatT4' }); results.push(r); console.log(`  ${r.tag}: ttfb=${r.ttfb}ms total=${r.total}ms`); }
console.log('phase B: same dialog, system grows (continuity simulation)');
{ const r = await request({ messages: [...hist.slice(0, -2), { role: 'user', content: USER[3] }], system: SYS + CONT, tag: 'B-sysGrow' }); results.push(r); console.log(`  ${r.tag}: ttfb=${r.ttfb}ms total=${r.total}ms`); }
{ const r = await request({ messages: [...hist.slice(0, -2), { role: 'user', content: USER[3] }], system: SYS + CONT, tag: 'B-sysGrow-repeat' }); results.push(r); console.log(`  ${r.tag}: ttfb=${r.ttfb}ms total=${r.total}ms`); }

const j = (o) => JSON.stringify(o);
console.log('\nRESULTS ' + j(results));
