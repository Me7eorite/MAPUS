const URL = '(?:[^()\\s]|\\([^()\\s]*\\))*';
const INLINE = new RegExp(
  `(!\\[[^\\]]*\\]\\(${URL}\\)|\\[[^\\]]*\\]\\(${URL}\\)|\`[^\`\\n]+\`|\\*\\*[^*\\n]+\\*\\*|~~[^~\\n]+~~|\\*[^*\\n]+\\*)`,
  'g',
);
const HR = /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

export function parseBlocks(source) {
  const chunks = String(source == null ? '' : source).split('```');
  const blocks = [];
  chunks.forEach((chunk, index) => {
    if (index % 2 === 1) {
      const body = chunk.replace(/^[a-zA-Z0-9+#_-]*\n/, '').replace(/\n$/, '');
      blocks.push({ type: 'code', text: body });
      return;
    }
    parseLines(chunk, blocks);
  });
  return blocks;
}

function parseLines(text, out) {
  const lines = String(text).split('\n');
  let list = null;
  let para = [];
  const flushList = () => {
    if (list) {
      out.push(list);
      list = null;
    }
  };
  const flushPara = () => {
    if (para.length) {
      out.push({ type: 'p', text: para.join('\n') });
      para = [];
    }
  };
  const flush = () => {
    flushPara();
    flushList();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(/\s+$/, '');
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      flush();
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map(cellAlign);
      const rows = [];
      let j = i + 2;
      while (j < lines.length) {
        const row = lines[j].replace(/\s+$/, '');
        if (!row.trim() || !row.includes('|')) break;
        rows.push(fitCells(splitRow(row), head.length));
        j += 1;
      }
      out.push({ type: 'table', head, align, rows });
      i = j - 1;
      continue;
    }
    if (HR.test(line)) {
      flush();
      out.push({ type: 'hr' });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      out.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      continue;
    }
    const quote = line.match(QUOTE);
    if (quote) {
      flush();
      const quoted = [quote[1]];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j].match(QUOTE);
        if (!next) break;
        quoted.push(next[1]);
        j += 1;
      }
      out.push({ type: 'quote', text: quoted.join('\n') });
      i = j - 1;
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      if (!list || list.type !== 'ul') {
        flush();
        list = { type: 'ul', items: [] };
      }
      list.items.push(makeItem(bullet[1], list));
      continue;
    }
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      if (!list || list.type !== 'ol') {
        flush();
        list = { type: 'ol', items: [] };
      }
      list.items.push(makeItem(ordered[2], list));
      continue;
    }
    flushList();
    para.push(line);
  }
  flush();
}

function makeItem(text, list) {
  const task = text.match(/^\[([ xX])\]\s*([\s\S]*)$/);
  if (!task) return text;
  list.task = true;
  return { text: task[2], checked: task[1].toLowerCase() === 'x' };
}

function splitRow(line) {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|')) body = body.slice(0, -1);
  return body.split('|').map(cell => cell.trim());
}

function isSeparator(line) {
  if (!line || !line.includes('-')) return false;
  const cells = splitRow(line);
  if (!cells.length) return false;
  return cells.every(cell => /^:?-{1,}:?$/.test(cell));
}

function cellAlign(cell) {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return '';
}

function fitCells(cells, width) {
  if (cells.length === width) return cells;
  if (cells.length > width) return cells.slice(0, width);
  return cells.concat(Array(width - cells.length).fill(''));
}

export function parseInline(text) {
  const tokens = [];
  const source = String(text == null ? '' : text);
  let cursor = 0;
  let match;
  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(source))) {
    if (match.index > cursor) tokens.push({ type: 'text', text: source.slice(cursor, match.index) });
    const raw = match[0];
    if (raw.startsWith('![')) {
      const parts = raw.match(/^!\[([^\]]*)\]\(([\s\S]*)\)$/);
      tokens.push({ type: 'image', alt: parts ? parts[1] : '', href: parts ? parts[2] : '' });
    } else if (raw.startsWith('[')) {
      const parts = raw.match(/^\[([^\]]*)\]\(([\s\S]*)\)$/);
      tokens.push({ type: 'link', text: parts ? parts[1] : raw, href: parts ? parts[2] : '' });
    } else if (raw.startsWith('`')) tokens.push({ type: 'code', text: raw.slice(1, -1) });
    else if (raw.startsWith('**')) tokens.push({ type: 'strong', text: raw.slice(2, -2) });
    else if (raw.startsWith('~~')) tokens.push({ type: 'del', text: raw.slice(2, -2) });
    else tokens.push({ type: 'em', text: raw.slice(1, -1) });
    cursor = match.index + raw.length;
  }
  if (cursor < source.length) tokens.push({ type: 'text', text: source.slice(cursor) });
  return tokens;
}

export function safeHref(href) {
  const value = String(href || '').trim();
  return /^(https?:\/\/|mailto:)/i.test(value) ? value : '';
}
