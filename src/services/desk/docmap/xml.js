// Minimal offset-preserving XML scanner (no DOMParser; runs in browser + node).
// Produces a light tree whose nodes remember their exact character offsets so
// patchers can splice new markup into the ORIGINAL string and leave every other
// byte untouched. Element names are matched by local name (prefix-agnostic).

// comment | CDATA | PI | doctype/decl | tag (attribute values may contain '>')
const TOKEN_RE = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<(\/?)([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const ATTR_RE = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseXml(xml) {
  const root = {
    type: 'el', qname: '#document', name: '#document', prefix: '', attrRaw: '',
    start: 0, openEnd: 0, closeStart: xml.length, end: xml.length, children: [], parent: null,
  };
  const stack = [root];
  let last = 0;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.children.push({ type: 'text', start: last, end: m.index, parent: top });
    last = TOKEN_RE.lastIndex;
    if (m[3] === undefined) {
      if (m[1] !== undefined) top.children.push({ type: 'cdata', start: m.index, end: last, value: m[1], parent: top });
      continue;
    }
    const qname = m[3];
    if (m[2] === '/') {
      let i = stack.length - 1;
      while (i > 0 && stack[i].qname !== qname) i--;
      if (i === 0) continue; // stray close tag: ignore
      // Anything left open above the match is treated as closed right here.
      for (let j = stack.length - 1; j > i; j--) {
        stack[j].closeStart = m.index;
        stack[j].end = m.index;
      }
      stack[i].closeStart = m.index;
      stack[i].end = last;
      stack.length = i;
      continue;
    }
    const colon = qname.indexOf(':');
    const node = {
      type: 'el',
      qname,
      prefix: colon >= 0 ? qname.slice(0, colon) : '',
      name: colon >= 0 ? qname.slice(colon + 1) : qname,
      attrRaw: m[4] || '',
      start: m.index,
      openEnd: last,
      closeStart: last,
      end: last,
      children: [],
      parent: top,
      selfClosing: m[5] === '/',
    };
    top.children.push(node);
    if (!node.selfClosing) stack.push(node);
  }
  if (last < xml.length) stack[stack.length - 1].children.push({ type: 'text', start: last, end: xml.length, parent: stack[stack.length - 1] });
  for (let j = stack.length - 1; j > 0; j--) {
    stack[j].closeStart = xml.length;
    stack[j].end = xml.length;
  }
  return root;
}

export function attrs(node) {
  if (node.attrs) return node.attrs;
  const out = {};
  if (node.attrRaw) {
    ATTR_RE.lastIndex = 0;
    let m;
    while ((m = ATTR_RE.exec(node.attrRaw))) out[m[1]] = decodeEntities(m[2] !== undefined ? m[2] : m[3]);
  }
  node.attrs = out;
  return out;
}

// Attribute lookup: exact qname first, then by local name (ignoring xmlns).
export function getAttr(node, name) {
  if (!node || node.type !== 'el') return undefined;
  const a = attrs(node);
  if (Object.prototype.hasOwnProperty.call(a, name)) return a[name];
  if (name.includes(':')) name = name.slice(name.indexOf(':') + 1);
  for (const k of Object.keys(a)) {
    const c = k.indexOf(':');
    if (c >= 0 && k.slice(0, c) !== 'xmlns' && k.slice(c + 1) === name) return a[k];
  }
  return undefined;
}

export function kids(node, name) {
  if (!node) return [];
  return node.children.filter((c) => c.type === 'el' && (name === undefined || c.name === name));
}

export function kid(node, name) {
  if (!node) return null;
  for (const c of node.children) if (c.type === 'el' && c.name === name) return c;
  return null;
}

// Depth-first descendants by local name; `skip` = set of local names not entered.
export function descendants(node, name, skip) {
  const out = [];
  const walk = (n) => {
    for (const c of n.children) {
      if (c.type !== 'el') continue;
      if (c.name === name) out.push(c);
      if (skip && skip.has(c.name)) continue;
      walk(c);
    }
  };
  if (node) walk(node);
  return out;
}

export function firstDesc(node, name, skip) {
  if (!node) return null;
  for (const c of node.children) {
    if (c.type !== 'el') continue;
    if (c.name === name) return c;
    if (skip && skip.has(c.name)) continue;
    const f = firstDesc(c, name, skip);
    if (f) return f;
  }
  return null;
}

export function hasDesc(node, names) {
  for (const c of node.children) {
    if (c.type !== 'el') continue;
    if (names.has(c.name) || hasDesc(c, names)) return true;
  }
  return false;
}

export function rootElement(tree) {
  return kids(tree)[0] || null;
}

// Decoded text content of a node (all descendant text + CDATA).
export function textOf(xml, node) {
  if (!node) return '';
  if (node.type === 'text') return decodeEntities(xml.slice(node.start, node.end));
  if (node.type === 'cdata') return node.value;
  let s = '';
  for (const c of node.children) s += textOf(xml, c);
  return s;
}

export function raw(xml, node) {
  return node ? xml.slice(node.start, node.end) : '';
}

export function openTag(xml, node) {
  return xml.slice(node.start, node.openEnd);
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s) {
  if (!s || s.indexOf('&') < 0) return s || '';
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (all, e) => {
    if (e[0] !== '#') return NAMED[e];
    const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try {
      return String.fromCodePoint(cp);
    } catch {
      return all;
    }
  });
}

// Characters that are illegal in XML 1.0 are dropped.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeText(s) {
  return String(s ?? '').replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}

function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Set (or add) an attribute on a raw open tag string like '<c r="A1" s="2">'.
export function setAttrInTag(tag, qname, value) {
  const re = new RegExp(`(\\s${reEscape(qname)}\\s*=\\s*)("[^"]*"|'[^']*')`);
  const v = `"${escapeAttr(value)}"`;
  if (re.test(tag)) return tag.replace(re, (all, pre) => pre + v);
  return tag.replace(/\s*(\/?)>$/, ` ${qname}=${v}$1>`);
}

export function removeAttrsInTag(tag, qnames) {
  let out = tag;
  for (const q of qnames) out = out.replace(new RegExp(`\\s+${reEscape(q)}\\s*=\\s*("[^"]*"|'[^']*')`, 'g'), '');
  return out;
}

// Apply non-overlapping splices [{start, end, text}] to a string.
export function applySplices(str, splices) {
  const list = [...splices].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = str;
  for (const s of list) out = out.slice(0, s.start) + s.text + out.slice(s.end);
  return out;
}

export function pfx(node) {
  return node && node.prefix ? `${node.prefix}:` : '';
}
