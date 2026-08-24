import { Link } from 'react-router-dom';

export const isHTMLCaption = str => /<[a-z][\s\S]*>/i.test(str);

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:'")\]])/g;

/** Wraps bare http(s) URLs in already-rendered text nodes with <a> tags, skipping text already inside a link. */
export function autoLinkTextNodes(root) {
  if (typeof document === 'undefined') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const targets = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('a')) continue;
    URL_RE.lastIndex = 0;
    if (URL_RE.test(node.nodeValue)) targets.push(node);
  }
  targets.forEach(textNode => {
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    URL_RE.lastIndex = 0;
    while ((match = URL_RE.exec(textNode.nodeValue))) {
      if (match.index > lastIndex) frag.appendChild(document.createTextNode(textNode.nodeValue.slice(lastIndex, match.index)));
      const a = document.createElement('a');
      a.href = match[0];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'sh-caption-link';
      a.textContent = match[0];
      frag.appendChild(a);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < textNode.nodeValue.length) frag.appendChild(document.createTextNode(textNode.nodeValue.slice(lastIndex)));
    textNode.parentNode.replaceChild(frag, textNode);
  });
}

export function sanitizeHTML(html) {
  if (typeof window === 'undefined' || !html) return html || '';
  const el = document.createElement('div');
  el.innerHTML = html;
  el.querySelectorAll('script,style,iframe,object,embed,form').forEach(n => n.remove());
  el.querySelectorAll('*').forEach(n => {
    ['onclick','onerror','onload','onmouseover'].forEach(a => n.removeAttribute(a));
  });
  el.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.setAttribute('rel', 'noopener noreferrer'); });
  autoLinkTextNodes(el);
  return el.innerHTML;
}

export function renderPlainCaption(caption) {
  if (!caption) return null;
  const parts = caption.split(/(#\w+|https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('#')) {
      return <Link key={i} to={`/shares/explore?tag=${part.slice(1)}`} className="sh-hashtag">{part}</Link>;
    }
    if (/^https?:\/\//.test(part)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="sh-caption-link">{part}</a>;
    }
    return part;
  });
}
