#!/usr/bin/env node
// Builds one self-contained legal page from the Markdown files in legal/.
// Usage: node scripts/build-legal.mjs <output.html> <input.md> [<input.md> ...]
//
// The output has no scripts, so it works under a strict script-src 'self' CSP.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [out, ...inputs] = process.argv.slice(2);
if (!out || inputs.length === 0) {
  console.error('usage: node scripts/build-legal.mjs <output.html> <input.md> [...]');
  process.exit(1);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

function render(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }

    // Table
    if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test((lines[i + 1] || '').trim())) {
      const head = line.split('|').slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      html.push(
        '<table><thead><tr>' +
          head.map((h) => `<th>${inline(h)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table>'
      );
      continue;
    }

    // Headings
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { html.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) { html.push('<hr>'); i++; continue; }

    // Bullet list
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++; }
      html.push('<ul>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ul>');
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
      html.push('<ol>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ol>');
      continue;
    }

    // Paragraph
    const para = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !/^\|/.test(lines[i]) &&
      !/^[-*]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i])
    ) { para.push(lines[i]); i++; }
    html.push('<p>' + inline(para.join(' ')) + '</p>');
  }
  return html.join('\n');
}

const body = inputs.map((f) => render(readFileSync(f, 'utf8'))).join('\n<hr class="sep">\n');

const page = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Legal</title>
<style>
:root{color-scheme:light dark}
body{margin:0 auto;padding:24px 18px 64px;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:46rem;color:#1c1c1e;background:#fff}
h1{font-size:1.6rem;line-height:1.25;margin:0 0 1rem}
h2{font-size:1.2rem;margin:2rem 0 .5rem}
h3{font-size:1.05rem;margin:1.5rem 0 .4rem}
table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:.95rem}
th,td{border:1px solid #d8d8dc;padding:.5rem .6rem;text-align:left;vertical-align:top}
th{background:#f4f4f6}
hr{border:0;border-top:1px solid #e2e2e6;margin:2.5rem 0}
hr.sep{border-top:2px solid #c9c9cf}
code{background:#f4f4f6;padding:.1rem .3rem;border-radius:4px;font-size:.9em}
a{color:#0a58ca}
@media (prefers-color-scheme:dark){body{background:#111;color:#e8e8ea}th{background:#1c1c1f}th,td{border-color:#333}hr{border-color:#2a2a2e}hr.sep{border-color:#444}code{background:#1c1c1f}a{color:#7cb2ff}}
</style>
</head>
<body>
${body}
</body>
</html>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page, 'utf8');
console.log('wrote', out);
