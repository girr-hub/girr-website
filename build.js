// 기르 홈페이지 빌드: static/ 를 그대로 복사하고, content/insights/*.md 로 인사이트 정적 페이지를 만든다.
// 외부 패키지 없이 Node 18+ 만으로 동작. Netlify 빌드 명령: node build.js / 게시 폴더: dist
'use strict';
const fs = require('fs');
const path = require('path');

const SITE = 'https://www.girr.co.kr';
const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');
const CONTENT = path.join(ROOT, 'content', 'insights');
const AUTHOR = { name: '이미현 (Sophia Lee)', short: '소피아', role: '주식회사 기르 대표이사', url: SITE + '/insights/' };
const CATEGORIES = [
  { slug: 'events', name: '외국인 행사', desc: '외국인 대상 행사·축제·네트워킹과 글로벌 MICE의 흐름, 기획 현장의 시사점을 다룹니다' },
  { slug: 'statistics', name: '외국인 통계', desc: '체류 외국인, 등록외국인, 지역별 분포 등 공식 통계로 읽는 한국의 외국인 사회' },
  { slug: 'students', name: '외국인 유학생', desc: '외국인 유학생 규모, 국적, 지역 분포, 졸업 후 진로와 정주를 데이터로 분석합니다' },
  { slug: 'startup', name: '외국인 창업', desc: '외국인 창업자와 유학생 창업, 창업비자(D-8-4)와 지원 프로그램을 다룹니다' },
  { slug: 'visa', name: '비자·체류', desc: '유학·구직·취업·정주 비자 제도와 변화, 실제 체류 자격 변경 흐름을 정리합니다' },
  { slug: 'tourism', name: '외국인 관광', desc: '방한 외래관광객과 체류 외국인의 국내 여행, 지역 관광 통계를 분석합니다' },
];
// 미리보기(PR) 빌드에서는 draft 도 보여주고, 실제 배포에서는 published 만 보여준다.
const IS_PREVIEW = process.env.CONTEXT && process.env.CONTEXT !== 'production';

// ---------- 유틸 ----------
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rmrf = p => fs.rmSync(p, { recursive: true, force: true });
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}
function write(rel, data) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
}
function fmtDate(d) { const [y, m, day] = d.split('-'); return `${y}년 ${+m}월 ${+day}일`; }

// ---------- 프론트매터 ----------
function parseFront(raw, file) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('frontmatter 없음: ' + file);
  const meta = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const li = line.match(/^\s+-\s+(.*)$/);
    if (li && key) { (meta[key] = Array.isArray(meta[key]) ? meta[key] : []).push(unq(li[1])); continue; }
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv) { key = kv[1]; const v = kv[2].trim(); meta[key] = v === '' ? [] : (v.startsWith('[') ? v.slice(1, -1).split(',').map(x => unq(x.trim())).filter(Boolean) : unq(v)); }
  }
  for (const k of ['title', 'description', 'date', 'slug', 'category']) if (!meta[k] || (Array.isArray(meta[k]) && !meta[k].length)) throw new Error(`${file}: ${k} 누락`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`${file}: date 형식(YYYY-MM-DD) 오류`);
  if (!/^[a-z0-9-]+$/.test(meta.slug)) throw new Error(`${file}: slug 는 영문 소문자·숫자·하이픈만`);
  if (!CATEGORIES.some(c => c.slug === meta.category)) throw new Error(`${file}: category 는 ${CATEGORIES.map(c => c.slug).join('/')} 중 하나`);
  meta.tags = Array.isArray(meta.tags) ? meta.tags : (meta.tags ? [meta.tags] : []);
  meta.status = meta.status || 'published';
  return { meta, body: m[2] };
}
function unq(s) { s = s.trim(); return (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")) ? s.slice(1, -1) : s; }

// ---------- 마크다운 (필요한 문법만) ----------
function inline(s) {
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  s = s.replace(/\[([^\]]+)\]\((\/[^\s)]*)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[\^(\d+)\]/g, '<sup class="fn"><a href="#src-$1" id="ref-$1">$1</a></sup>');
  return s;
}
function md(src) {
  const lines = src.replace(/\r/g, '').split('\n');
  const out = []; const toc = [];
  let i = 0;
  const isBlank = l => !l.trim();
  while (i < lines.length) {
    const l = lines[i];
    if (isBlank(l)) { i++; continue; }
    let h = l.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length, text = h[2].trim(), id = 'h-' + (toc.length + 1);
      if (lvl === 2) toc.push({ id, text });
      out.push(`<h${lvl} id="${id}">${inline(text)}</h${lvl}>`); i++; continue;
    }
    if (/^>\s?/.test(l)) {
      const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`); continue;
    }
    if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(rows[0]); const body = rows.slice(2).map(cells);
      out.push(`<div class="tw"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^[-*]\s+/.test(l)) {
      const buf = []; while (i < lines.length && /^[-*]\s+/.test(lines[i])) buf.push(lines[i++].replace(/^[-*]\s+/, ''));
      out.push(`<ul>${buf.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`); continue;
    }
    if (/^\d+\.\s+/.test(l)) {
      const buf = []; while (i < lines.length && /^\d+\.\s+/.test(lines[i])) buf.push(lines[i++].replace(/^\d+\.\s+/, ''));
      out.push(`<ol>${buf.map(x => `<li>${inline(x)}</li>`).join('')}</ol>`); continue;
    }
    const buf = []; while (i < lines.length && !isBlank(lines[i]) && !/^(#{2,3}\s|>|\||[-*]\s|\d+\.\s)/.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return { html: out.join('\n'), toc };
}

// 출처 섹션: "## 출처" 아래 번호 목록을 각주 앵커가 있는 목록으로 바꾼다
function splitSources(body) {
  const idx = body.search(/^##\s+출처\s*$/m);
  if (idx < 0) return { main: body, sources: [] };
  const main = body.slice(0, idx), rest = body.slice(idx).split('\n').slice(1);
  const sources = rest.filter(l => /^\d+\.\s+/.test(l)).map(l => l.replace(/^\d+\.\s+/, ''));
  return { main, sources };
}

// ---------- 공통 레이아웃 ----------
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,700;0,800;1,900&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">';
const CSS = `
.ins-hero{background:var(--k);color:#fff;padding-block:clamp(56px,8vw,96px) clamp(36px,5vw,56px);position:relative;overflow:hidden}
.ins-hero h1{font-size:clamp(32px,5vw,54px);margin-top:14px;letter-spacing:-.035em}
.ins-hero p.lead{color:#CFCFCF;margin-top:14px;max-width:60ch;font-size:17px}
.ins-hero .eyebrow{color:#A3A3A3}
.ins-hero .wave{position:absolute;right:-60px;bottom:-60px;width:360px;height:360px;border-radius:50%;border:1.5px solid var(--navy);box-shadow:0 0 0 36px rgba(30,63,174,.10),0 0 0 80px rgba(30,63,174,.06);pointer-events:none}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:26px}
.chips a{font-size:14px;font-weight:600;padding:8px 16px;border:1px solid rgba(255,255,255,.25);color:#fff;text-decoration:none}
.chips a:hover,.chips a.on{background:var(--navy);border-color:var(--navy)}
.list{display:grid;grid-template-columns:repeat(2,1fr);gap:0;border-top:2px solid var(--k)}
.card{display:flex;flex-direction:column;gap:10px;padding:28px 28px 28px 0;border-bottom:1px solid var(--line);text-decoration:none;color:var(--k)}
.card:nth-child(even){padding-left:28px;padding-right:0;border-left:1px solid var(--line)}
.card .meta{font-size:13px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.card .cat{font-weight:700;color:var(--k);display:inline-flex;align-items:center;gap:6px}
.card .cat::before{content:"";width:8px;height:8px;background:var(--navy)}
.card h2{font-size:clamp(19px,2vw,23px);line-height:1.4}
.card p{color:var(--muted);font-size:15px}
.card:hover h2{text-decoration:underline;text-decoration-color:var(--navy);text-underline-offset:4px}
@media (max-width:760px){.list{grid-template-columns:1fr}.card,.card:nth-child(even){padding:24px 0;border-left:0}}
.empty{border:1px dashed #CFCFCF;padding:40px 24px;text-align:center;color:var(--muted)}
.article{max-width:740px;margin:0 auto}
.article .meta{font-size:14px;color:var(--muted);display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}
.article h1{font-size:clamp(28px,4.4vw,44px);line-height:1.3;margin-top:14px}
.article .dek{font-size:18px;color:#333;margin-top:16px}
.crumb{font-size:13px;color:var(--muted)}
.crumb a{color:var(--muted)}
.byline{display:flex;align-items:center;gap:14px;margin-top:26px;padding:16px 0;border-block:1px solid var(--line)}
.byline .av{width:44px;height:44px;border-radius:50%;background:var(--k);color:#fff;display:grid;place-items:center;font-family:var(--f-display);font-weight:900;font-style:italic;flex:none;position:relative}
.byline .av::after{content:"";position:absolute;right:-2px;bottom:-2px;width:12px;height:12px;border-radius:50%;background:var(--navy);border:2px solid #fff}
.byline b{display:block;font-size:15px}
.byline span{font-size:13px;color:var(--muted)}
.toc{background:var(--soft);padding:18px 22px;margin-top:28px;font-size:14px}
.toc b{display:block;margin-bottom:8px}
.toc ol{margin:0;padding-left:20px}
.toc a{color:var(--k)}
.body{margin-top:32px;font-size:17px;line-height:1.85}
.body h2{font-size:24px;margin-top:48px;padding-top:20px;border-top:2px solid var(--k)}
.body h3{font-size:19px;margin-top:30px}
.body p,.body ul,.body ol{margin-top:16px}
.body li{margin-top:6px}
.body blockquote{margin:24px 0;padding:18px 22px;border-left:4px solid var(--navy);background:var(--soft);font-weight:600}
.body strong{background:linear-gradient(transparent 62%,rgba(30,63,174,.18) 62%)}
.body a{color:var(--k);text-decoration-color:var(--navy);text-underline-offset:3px}
.tw{overflow-x:auto;margin-top:18px}
.body table{width:100%;border-collapse:collapse;font-size:15px;min-width:480px}
.body th,.body td{border-bottom:1px solid var(--line);padding:10px 12px;text-align:left;font-variant-numeric:tabular-nums}
.body th{border-bottom:2px solid var(--k);font-size:14px}
sup.fn a{font-size:11px;font-weight:700;color:var(--navy);text-decoration:none;padding:0 2px}
.sources{margin-top:48px;padding-top:20px;border-top:2px solid var(--k);font-size:14px}
.sources h2{font-size:18px}
.sources ol{padding-left:20px;margin-top:12px}
.sources li{margin-top:8px;color:#333;overflow-wrap:anywhere}
.sources a{color:var(--k)}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:28px}
.tags span{font-size:13px;border:1px solid var(--line);padding:4px 10px}
.authorbox{margin-top:40px;border:1px solid var(--line);border-top:4px solid var(--navy);padding:22px;display:grid;gap:8px}
.authorbox b{font-size:16px}
.authorbox p{font-size:14px;color:var(--muted)}
.cta{margin-top:28px;background:var(--k);color:#fff;padding:26px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.cta p{font-size:16px;font-weight:600}
.related{margin-top:56px}
.related h2{font-size:20px;margin-bottom:12px}
.related a{display:block;padding:14px 0;border-bottom:1px solid var(--line);text-decoration:none;color:var(--k);font-weight:600}
.related a small{display:block;font-weight:400;color:var(--muted);font-size:13px}
.preview{background:var(--navy);color:#fff;text-align:center;font-size:14px;font-weight:600;padding:10px 16px}
`;
function page({ title, description, canonical, body, jsonld = [], ogType = 'website', extraHead = '' }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${IS_PREVIEW ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="기르 GIRR">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/rss+xml" title="기르 인사이트" href="${SITE}/insights/feed.xml">
${extraHead}
${FONTS}
<link rel="stylesheet" href="/sub.css">
<style>${CSS}</style>
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>
<body>
${IS_PREVIEW ? '<div class="preview">미리보기 화면입니다. 승인(병합)하면 실제 사이트에 게시됩니다.</div>' : ''}
<header class="nav"><div class="wrap"><a class="logo" href="/">Girr<small>기르</small></a><a class="back" href="/insights/">인사이트 전체 보기 →</a></div></header>
${body}
<footer><div class="wrap"><span>© ${new Date().getFullYear()} GIRR Inc. · 주식회사 기르</span><span><a href="/">홈</a> · <a href="/insights/">인사이트</a> · <a href="/privacy.html">개인정보처리방침</a></span></div></footer>
</body>
</html>`;
}
const orgLd = { '@type': 'Organization', name: '주식회사 기르', alternateName: ['기르', 'GIRR'], url: SITE + '/', logo: SITE + '/og.jpg' };
const authorLd = { '@type': 'Person', name: '이미현', alternateName: 'Sophia Lee', jobTitle: '대표이사', worksFor: orgLd, url: AUTHOR.url };

function card(p) {
  const c = CATEGORIES.find(x => x.slug === p.meta.category);
  return `<a class="card" href="/insights/${p.meta.slug}/"><div class="meta"><span class="cat">${esc(c.name)}</span><time datetime="${p.meta.date}">${fmtDate(p.meta.date)}</time><span>${p.readMin}분 읽기</span></div><h2>${esc(p.meta.title)}</h2><p>${esc(p.meta.description)}</p></a>`;
}

// ---------- 빌드 ----------
rmrf(OUT);
copyDir(path.join(ROOT, 'static'), OUT);

const files = fs.existsSync(CONTENT) ? fs.readdirSync(CONTENT).filter(f => f.endsWith('.md')) : [];
const posts = files.map(f => {
  const { meta, body } = parseFront(fs.readFileSync(path.join(CONTENT, f), 'utf8'), f);
  const { main, sources } = splitSources(body);
  const { html, toc } = md(main);
  const chars = main.replace(/\s/g, '').length;
  return { file: f, meta, html, toc, sources, readMin: Math.max(1, Math.round(chars / 500)) };
}).filter(p => IS_PREVIEW || p.meta.status === 'published')
  .sort((a, b) => b.meta.date.localeCompare(a.meta.date) || a.meta.slug.localeCompare(b.meta.slug));

const seen = new Set();
for (const p of posts) { if (seen.has(p.meta.slug)) throw new Error('slug 중복: ' + p.meta.slug); seen.add(p.meta.slug); }

// 글 페이지
for (const p of posts) {
  const c = CATEGORIES.find(x => x.slug === p.meta.category);
  const url = `${SITE}/insights/${p.meta.slug}/`;
  const related = posts.filter(x => x !== p && x.meta.category === p.meta.category).slice(0, 3);
  const more = related.length < 3 ? posts.filter(x => x !== p && !related.includes(x)).slice(0, 3 - related.length) : [];
  const body = `
<main><div class="wrap"><article class="article">
  <nav class="crumb" aria-label="경로"><a href="/">홈</a> › <a href="/insights/">인사이트</a> › <a href="/insights/category/${c.slug}/">${esc(c.name)}</a></nav>
  <p class="eyebrow" style="margin-top:18px">${esc(c.name)}</p>
  <h1>${esc(p.meta.title)}</h1>
  <p class="dek">${esc(p.meta.description)}</p>
  <div class="byline"><span class="av" aria-hidden="true">S</span><div><b>글 · ${esc(AUTHOR.short)} (${esc(AUTHOR.name)})</b><span>${esc(AUTHOR.role)} · <time datetime="${p.meta.date}">${fmtDate(p.meta.date)}</time>${p.meta.updated ? ` · 수정 ${fmtDate(p.meta.updated)}` : ''} · ${p.readMin}분 읽기</span></div></div>
  ${p.toc.length > 2 ? `<nav class="toc" aria-label="목차"><b>목차</b><ol>${p.toc.map(t => `<li><a href="#${t.id}">${inline(t.text)}</a></li>`).join('')}</ol></nav>` : ''}
  <div class="body">${p.html}</div>
  ${p.sources.length ? `<section class="sources" aria-label="출처"><h2>출처</h2><ol>${p.sources.map((s, i) => `<li id="src-${i + 1}">${inline(s)}</li>`).join('')}</ol></section>` : ''}
  ${p.meta.tags.length ? `<div class="tags">${p.meta.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
  <div class="authorbox"><b>소피아 · 이미현 (Sophia Lee)</b><p>주식회사 기르 대표이사. 국회 보좌관으로 외국인 비자 관련 입법을 맡았고, 홍콩·일본에서 7년간 외국인으로 살았습니다. 1.9만 명 규모의 재한 외국인 커뮤니티와 함께 행사·투어를 만들며 외국인 정주 데이터를 기록합니다.</p></div>
  <div class="cta"><p>외국인 대상 행사·모객·투어가 필요하신가요?</p><a class="btn point" href="/#contact">기르에 문의하기 →</a></div>
  ${(related.length + more.length) ? `<section class="related"><h2>함께 읽으면 좋은 글</h2>${[...related, ...more].map(r => `<a href="/insights/${r.meta.slug}/">${esc(r.meta.title)}<small>${fmtDate(r.meta.date)}</small></a>`).join('')}</section>` : ''}
</article></div></main>`;
  write(`insights/${p.meta.slug}/index.html`, page({
    title: `${p.meta.title} | 기르 인사이트`, description: p.meta.description, canonical: url, body, ogType: 'article',
    extraHead: `<meta property="article:published_time" content="${p.meta.date}T22:00:00+09:00"><meta property="article:author" content="이미현 (Sophia Lee)"><meta property="article:section" content="${esc(c.name)}">${p.meta.tags.map(t => `<meta property="article:tag" content="${esc(t)}">`).join('')}`,
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'Article', headline: p.meta.title, description: p.meta.description, datePublished: p.meta.date + 'T22:00:00+09:00', dateModified: (p.meta.updated || p.meta.date) + 'T22:00:00+09:00', author: authorLd, publisher: orgLd, mainEntityOfPage: url, image: SITE + '/og.jpg', inLanguage: 'ko-KR', articleSection: c.name, keywords: p.meta.tags.join(', '), citation: p.sources.map(s => (s.match(/https?:\/\/[^\s)]+/) || [])[0]).filter(Boolean) },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: '홈', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: '인사이트', item: SITE + '/insights/' }, { '@type': 'ListItem', position: 3, name: c.name, item: `${SITE}/insights/category/${c.slug}/` }, { '@type': 'ListItem', position: 4, name: p.meta.title, item: url }] },
    ],
  }));
}

// 목록 페이지 (전체 + 카테고리별)
function listPage(cat) {
  const list = cat ? posts.filter(p => p.meta.category === cat.slug) : posts;
  const url = cat ? `${SITE}/insights/category/${cat.slug}/` : `${SITE}/insights/`;
  const title = cat ? `${cat.name} 인사이트 | 기르 GIRR` : '외국인 인사이트 · 행사, 통계, 유학생, 창업, 비자 | 기르 GIRR';
  const desc = cat ? cat.desc : '외국인 통계, 외국인 유학생, 외국인 창업, 비자, 외국인 관광 데이터를 기르 대표 소피아(이미현)가 공식 통계와 현장 경험으로 분석합니다.';
  const body = `
<section class="ins-hero"><span class="wave" aria-hidden="true"></span><div class="wrap">
  <p class="eyebrow">Insights${cat ? ' · ' + esc(cat.name) : ''}</p>
  <h1>${cat ? esc(cat.name) : '외국인 인사이트'}</h1>
  <p class="lead">${esc(desc)}</p>
  <nav class="chips" aria-label="카테고리"><a href="/insights/"${cat ? '' : ' class="on"'}>전체</a>${CATEGORIES.map(c => `<a href="/insights/category/${c.slug}/"${cat && cat.slug === c.slug ? ' class="on"' : ''}>${esc(c.name)}</a>`).join('')}</nav>
</div></section>
<main><div class="wrap">
  ${list.length ? `<div class="list">${list.map(card).join('')}</div>` : '<div class="empty"><b style="display:block;color:var(--k);font-size:18px;margin-bottom:6px">곧 첫 글이 올라옵니다</b>공식 통계를 바탕으로 한 분석 글을 매일 준비하고 있습니다.</div>'}
</div></main>`;
  return page({
    title, description: desc, canonical: url, body,
    jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description: desc, url, publisher: orgLd, mainEntity: { '@type': 'ItemList', itemListElement: list.slice(0, 50).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/insights/${p.meta.slug}/`, name: p.meta.title })) } }],
  });
}
write('insights/index.html', listPage(null));
for (const c of CATEGORIES) write(`insights/category/${c.slug}/index.html`, listPage(c));

// RSS (네이버 서치어드바이저 RSS 제출용)
const rfc = d => new Date(d + 'T22:00:00+09:00').toUTCString();
write('insights/feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>기르 인사이트</title><link>${SITE}/insights/</link><description>외국인 행사·통계·유학생·창업·비자·관광 분석</description><language>ko</language>
<atom:link href="${SITE}/insights/feed.xml" rel="self" type="application/rss+xml"/>
${posts.slice(0, 30).map(p => `<item><title>${esc(p.meta.title)}</title><link>${SITE}/insights/${p.meta.slug}/</link><guid isPermaLink="true">${SITE}/insights/${p.meta.slug}/</guid><pubDate>${rfc(p.meta.date)}</pubDate><description>${esc(p.meta.description)}</description><category>${esc(CATEGORIES.find(c => c.slug === p.meta.category).name)}</category></item>`).join('\n')}
</channel></rss>`);

// 사이트맵
const urls = [
  { loc: SITE + '/', pri: '1.0' }, { loc: SITE + '/insights/', pri: '0.9', mod: posts[0] && posts[0].meta.date },
  ...CATEGORIES.map(c => ({ loc: `${SITE}/insights/category/${c.slug}/`, pri: '0.6' })),
  ...posts.map(p => ({ loc: `${SITE}/insights/${p.meta.slug}/`, pri: '0.8', mod: p.meta.updated || p.meta.date })),
  { loc: SITE + '/careers.html', pri: '0.5' }, { loc: SITE + '/privacy.html', pri: '0.2' },
];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ''}<priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`);
write('robots.txt', IS_PREVIEW ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /apply.html\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`빌드 완료: 글 ${posts.length}편${IS_PREVIEW ? ' (미리보기: 초안 포함)' : ''} → dist/`);
