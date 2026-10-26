import type { ReactNode } from 'react';
import noticeMarkdown from '../../legal/privacy-notice.md?raw';

export const PRIVACY_NOTICE_MARKDOWN = noticeMarkdown;

type NoticeBlock =
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'hr' };

/** Plain words of the notice, so the in-app view and the hosted page can be compared. */
export function privacyPlain(source: string): string {
  const decoded = source
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
  const text = decoded
    .replace(/<\/(h1|h2|p|li|tr|th|td|article)>/gi, '\n')
    .replace(/<(h1|h2|p|li|tr|th|td|hr|ul|ol|table|thead|tbody|article)(\s[^>]*)?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const parts: string[] = [];
  for (const raw of text.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ')) line = line.slice(3).trim();
    else if (line.startsWith('# ')) line = line.slice(2).trim();
    if (line === '---' || (/^[\s|:-]+$/.test(line) && line.includes('-'))) continue;
    if (line.startsWith('|')) {
      const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()).filter(Boolean);
      if (cells.every((cell) => /^-+$/.test(cell))) continue;
      line = cells.join(' ');
    }
    if (line.startsWith('- ')) line = line.slice(2);
    line = line.replace(/\*\*/g, '').replace(/\*/g, '');
    parts.push(line);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function blocksOf(markdown: string): NoticeBlock[] {
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (line.trim() === '') {
      if (current.length > 0) chunks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks.map(parseBlock);
}

function parseBlock(lines: string[]): NoticeBlock {
  const first = lines[0]?.trim() ?? '';
  if (first.startsWith('## ')) return { kind: 'h2', text: first.slice(3).trim() };
  if (first.startsWith('# ')) return { kind: 'h1', text: first.slice(2).trim() };
  if (first === '---') return { kind: 'hr' };
  if (first.startsWith('|')) return parseTable(lines);
  if (first.startsWith('- ')) return { kind: 'ul', items: listItems(lines) };
  return { kind: 'p', text: lines.map((line) => line.trim()).join(' ') };
}

function listItems(lines: string[]): string[] {
  const items: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) items.push(trimmed.slice(2));
    else if (items.length > 0) {
      const last = items.length - 1;
      items[last] = `${items[last]} ${trimmed}`;
    }
  }
  return items;
}

function parseTable(lines: string[]): NoticeBlock {
  const content = lines.filter((line) => !/^[\s|:-]+$/.test(line.trim()));
  const parsed = content.map((line) => (
    line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
  ));
  const [headers, ...rows] = parsed;
  return { kind: 'table', headers: headers ?? [], rows };
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  parts.forEach((part, index) => {
    if (!part) return;
    if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b${index}`}>{part.slice(2, -2)}</strong>);
      return;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      nodes.push(<em key={`${keyPrefix}-i${index}`}>{part.slice(1, -1)}</em>);
      return;
    }
    nodes.push(part);
  });
  return nodes;
}

function renderBlock(block: NoticeBlock, index: number): ReactNode {
  switch (block.kind) {
    case 'h1':
      return <h1 key={index}>{inline(block.text, `h1-${index}`)}</h1>;
    case 'h2':
      return <h2 key={index}>{inline(block.text, `h2-${index}`)}</h2>;
    case 'p':
      return <p key={index}>{inline(block.text, `p-${index}`)}</p>;
    case 'ul':
      return (
        <ul key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item, `li-${index}-${itemIndex}`)}</li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <table key={index}>
          <thead>
            <tr>
              {block.headers.map((header, headerIndex) => (
                <th key={headerIndex}>{inline(header, `th-${index}-${headerIndex}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{inline(cell, `td-${index}-${rowIndex}-${cellIndex}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'hr':
      return <hr key={index} />;
    default: {
      const unexpected: never = block;
      throw new Error(`Unhandled privacy notice block: ${JSON.stringify(unexpected)}`);
    }
  }
}

/** Same words as `legal/privacy-notice.md` and the privacy section of the hosted legal page. */
export function PrivacyNotice() {
  return (
    <article className="privacy-notice">
      {blocksOf(noticeMarkdown).map((block, index) => renderBlock(block, index))}
    </article>
  );
}
