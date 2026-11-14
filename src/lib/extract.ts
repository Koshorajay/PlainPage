import type { SourceDoc } from '../types';

/**
 * Pulls the readable text out of a web page: headings, paragraphs and lists,
 * without menus, ads, footers or scripts.
 *
 * IMPORTANT: this function is injected into web pages by the extension with
 * chrome.scripting.executeScript, which serialises it with toString(). It must
 * therefore be fully self-contained: no imports, no references to anything
 * outside its own body.
 */
export function extractPage(docArg?: Document): { title: string; url: string; text: string; selection: boolean } {
  var doc = docArg || document;
  var view = doc.defaultView;

  var selected = '';
  if (!docArg && view && view.getSelection) {
    var sel = view.getSelection();
    selected = sel ? String(sel).trim() : '';
  }
  var title = (doc.title || '').trim();
  var url = docArg ? '' : String(doc.location ? doc.location.href : '');
  if (selected.length > 40) {
    return { title: title, url: url, text: selected, selection: true };
  }

  var SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|NAV|ASIDE|FOOTER|HEADER|FORM|BUTTON|SELECT|TEXTAREA|INPUT|SVG|CANVAS|IFRAME|VIDEO|AUDIO|FIGURE|DIALOG|MENU)$/;
  var NOISE = /(^|[\s_-])(nav|menu|sidebar|footer|header|comment|share|social|advert|ads?|promo|cookie|banner|breadcrumb|related|newsletter|subscribe|popup|modal)([\s_-]|$)/i;

  function hidden(el: Element): boolean {
    if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden')) return true;
    if (view && view.getComputedStyle && !docArg) {
      var style = view.getComputedStyle(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
    }
    return false;
  }

  function noisy(el: Element): boolean {
    var role = el.getAttribute('role') || '';
    if (/^(navigation|banner|contentinfo|complementary|search|dialog)$/.test(role)) return true;
    var marker = (el.getAttribute('class') || '') + ' ' + (el.getAttribute('id') || '');
    return NOISE.test(marker);
  }

  function clean(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  // Pick the part of the page that holds the most paragraph text.
  var root: Element | null = null;
  var candidates = doc.querySelectorAll('article, main, [role="main"]');
  var best = 0;
  for (var i = 0; i < candidates.length; i++) {
    var paragraphs = candidates[i].querySelectorAll('p');
    var score = 0;
    for (var j = 0; j < paragraphs.length; j++) score += (paragraphs[j].textContent || '').length;
    if (score > best) {
      best = score;
      root = candidates[i];
    }
  }
  if (!root || best < 400) root = doc.body;
  if (!root) return { title: title, url: url, text: '', selection: false };

  var isArticleRoot = root !== doc.body;
  var blocks: string[] = [];

  function walk(el: Element): void {
    var tag = el.tagName.toUpperCase();
    if (SKIP.test(tag)) {
      // The page's own <header> usually holds the title inside an <article>.
      if (!(tag === 'HEADER' && isArticleRoot)) return;
    }
    if (hidden(el)) return;
    if (el !== root && noisy(el)) return;

    if (/^H[1-6]$/.test(tag)) {
      var heading = clean(el.textContent || '');
      if (heading) blocks.push((tag === 'H1' ? '# ' : '## ') + heading);
      return;
    }
    if (tag === 'P' || tag === 'BLOCKQUOTE' || tag === 'DD' || tag === 'DT' || tag === 'FIGCAPTION') {
      var paragraph = clean(el.textContent || '');
      if (paragraph.length > 1) blocks.push(paragraph);
      return;
    }
    if (tag === 'LI') {
      var nested = el.querySelector('ul, ol, p');
      if (!nested) {
        var item = clean(el.textContent || '');
        if (item) blocks.push('- ' + item);
        return;
      }
    }
    if (tag === 'PRE' || tag === 'CODE') return;
    if (tag === 'TR') {
      var cells = el.querySelectorAll('th, td');
      var row: string[] = [];
      for (var c = 0; c < cells.length; c++) {
        var cell = clean(cells[c].textContent || '');
        if (cell) row.push(cell);
      }
      if (row.length) blocks.push('- ' + row.join(': '));
      return;
    }

    var hasElementChild = false;
    var directText = '';
    for (var n = 0; n < el.childNodes.length; n++) {
      var node = el.childNodes[n];
      if (node.nodeType === 1) {
        hasElementChild = true;
      } else if (node.nodeType === 3) {
        directText += node.nodeValue || '';
      }
    }
    // A <div> used as a paragraph: text with only inline children.
    if (tag === 'DIV' || tag === 'SECTION' || tag === 'SPAN' || tag === 'TD') {
      var blockChild = el.querySelector('p, div, ul, ol, h1, h2, h3, h4, h5, h6, table, section, article, blockquote, li');
      if (!blockChild) {
        var loose = clean(el.textContent || '');
        if (loose.length > 40) blocks.push(loose);
        return;
      }
      var stray = clean(directText);
      if (stray.length > 60) blocks.push(stray);
    }
    if (!hasElementChild) return;
    for (var k = 0; k < el.children.length; k++) walk(el.children[k]);
  }

  walk(root);

  // Join list items into one block, and drop exact repeats (menus that slipped through).
  var seen: { [key: string]: boolean } = {};
  var out: string[] = [];
  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b];
    if (block.length > 30 && seen[block]) continue;
    seen[block] = true;
    var previous = out.length ? out[out.length - 1] : '';
    if (block.indexOf('- ') === 0 && previous.indexOf('- ') === 0) {
      out[out.length - 1] = previous + '\n' + block;
    } else {
      out.push(block);
    }
  }

  return { title: title, url: url, text: out.join('\n\n'), selection: false };
}

/** Converts pasted or dropped HTML into PlainPage's simple text format. */
export function htmlToText(html: string): { title: string; text: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const result = extractPage(doc);
  return { title: result.title, text: result.text };
}

/** Guesses a title for text that arrived without one. */
export function guessTitle(text: string): string {
  const first = text
    .split('\n')
    .map((line) => line.replace(/^#{1,6}\s+/, '').trim())
    .find((line) => line.length > 0);
  if (!first) return 'Untitled';
  return first.length > 70 ? `${first.slice(0, 67).trimEnd()}...` : first;
}

export function toSourceDoc(text: string, title?: string, url?: string): SourceDoc {
  return { text, title: title?.trim() || guessTitle(text), url: url || undefined };
}
