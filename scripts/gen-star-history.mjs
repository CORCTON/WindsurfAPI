#!/usr/bin/env node
// 生成 Star History SVG —— 自托管方案（不依赖 star-history 第三方服务）
// 用法: GITHUB_TOKEN 可选; node scripts/gen-star-history.mjs
// 输出: assets/star-history.svg
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO = 'dwgx/WindsurfAPI';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'star-history.svg');

async function fetchStars() {
  let token = process.env.GITHUB_TOKEN || '';
  if (!token) {
    try { token = execSync('gh auth token', { encoding: 'utf8' }).trim(); } catch (e) { /* CI 无 gh 时忽略 */ }
  }
  const headers = {
    'Accept': 'application/vnd.github.star+json',  // starred_at 时间戳
    'User-Agent': 'star-history-gen',
    ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
  };
  const stars = [];
  let page = 1;
  for (;;) {
    const url = `https://api.github.com/repos/${REPO}/stargazers?per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const s of batch) {
      if (s.starred_at) stars.push(s.starred_at);
    }
    // 检查是否还有下一页
    const link = res.headers.get('link') || '';
    if (!/rel="next"/.test(link)) break;
    page++;
    if (page > 200) break;  // 安全阀
  }
  return stars;
}

function makeSvg(stars) {
  const W = 800, H = 400, padL = 60, padR = 30, padT = 30, padB = 50;
  if (stars.length === 0) return null;
  const t0 = Date.parse(stars[0]);
  const t1 = Date.parse(stars[stars.length - 1]);
  const span = Math.max(t1 - t0, 1);
  const X = t => padL + (Date.parse(t) - t0) / span * (W - padL - padR);
  const Y = n => padT + (H - padT - padB) * (1 - n / stars.length);
  const points = stars.map((t, i) => `${X(t).toFixed(1)},${Y(i + 1).toFixed(1)}`).join(' ');
  const monthLabels = [];
  const seen = new Set();
  for (const t of stars) {
    const d = new Date(t);
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!seen.has(mk)) { seen.add(mk); monthLabels.push({ x: X(t), label: mk }); }
  }
  const finalStar = stars.length;
  const firstDate = stars[0].slice(0, 10);
  const lastDate = stars[stars.length - 1].slice(0, 10);

  const lines = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Star History">`);
  lines.push(`<style>
    .bg { fill: #0d1117; }
    .grid { stroke: rgba(255,255,255,.06); stroke-width: 1; }
    .axis { stroke: rgba(255,255,255,.2); stroke-width: 1.5; }
    .line { fill: none; stroke: #f5c518; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
    .glow { fill: none; stroke: rgba(245,197,24,.25); stroke-width: 7; stroke-linecap: round; }
    .label { fill: #8b949e; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
    .big { fill: #e6edf3; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 22px; font-weight: 700; }
    .sub { fill: #71717a; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
    .dot { fill: #f5c518; }
  </style>`);
  lines.push(`<rect class="bg" width="${W}" height="${H}" rx="12"/>`);
  // 网格线（0/25/50/75/100%）
  for (const f of [0, .25, .5, .75, 1]) {
    const y = padT + (H - padT - padB) * (1 - f);
    lines.push(`<line class="grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>`);
    lines.push(`<text class="label" x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${Math.round(stars.length * f)}</text>`);
  }
  // 基线
  lines.push(`<line class="axis" x1="${padL}" y1="${(H - padB).toFixed(1)}" x2="${W - padR}" y2="${(H - padB).toFixed(1)}"/>`);
  // 辉光 + 主线
  lines.push(`<polyline class="glow" points="${points}"/>`);
  lines.push(`<polyline class="line" points="${points}"/>`);
  // 终点圆点
  const lx = X(stars[stars.length - 1]), ly = Y(stars.length);
  lines.push(`<circle class="dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4"/>`);
  // 月份标签
  for (const { x, label } of monthLabels) {
    lines.push(`<text class="label" x="${x.toFixed(1)}" y="${H - padB + 22}" text-anchor="middle">${label}</text>`);
  }
  // 信息
  lines.push(`<text class="big" x="${padL}" y="${padT + 20}">${finalStar.toLocaleString('en-US')} stars</text>`);
  lines.push(`<text class="sub" x="${padL}" y="${padT + 40}">${firstDate} → ${lastDate} · ${REPO}</text>`);
  lines.push(`</svg>`);
  return lines.join('\n');
}

(async () => {
  console.log('拉取 star 数据…');
  const stars = await fetchStars();
  console.log(`共 ${stars.length} 条 star 记录`);
  const svg = makeSvg(stars);
  if (!svg) { console.error('无数据'); process.exit(1); }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, svg);
  console.log('已写入', OUT);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
