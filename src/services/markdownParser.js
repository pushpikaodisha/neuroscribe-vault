/**
 * NeuroScribe Studio - Markdown Parser Service
 * Robust parser for Frontmatter, Wiki-Links, Tags, and Markdown-to-HTML conversion.
 */

/**
 * Parses YAML frontmatter from markdown text
 * @param {string} raw - Raw markdown content
 * @returns {{ frontmatter: Object, content: string }}
 */
export function parseFrontmatter(raw = '') {
  const normalized = raw.replace(/\r\n/g, '\n');
  const frontmatterRegex = /^---\n([\s\S]*?)\n---(?:\n|$)/;
  const match = normalized.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, content: normalized.trim() };
  }

  const yamlBlock = match[1];
  const content = normalized.slice(match[0].length).trim();
  const frontmatter = {};

  const lines = yamlBlock.split('\n');
  let currentKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array item under currentKey
    if (trimmed.startsWith('- ') && currentKey) {
      const val = trimmed.slice(2).trim().replace(/^['"]|['"]$/g, '');
      if (!Array.isArray(frontmatter[currentKey])) {
        frontmatter[currentKey] = [];
      }
      frontmatter[currentKey].push(val);
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      let value = trimmed.slice(colonIdx + 1).trim();

      if (value === '') {
        currentKey = key;
        frontmatter[key] = [];
      } else {
        currentKey = null;
        // Check for inline array: [item1, item2]
        if (value.startsWith('[') && value.endsWith(']')) {
          frontmatter[key] = value
            .slice(1, -1)
            .split(',')
            .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
        } else if (value.toLowerCase() === 'true') {
          frontmatter[key] = true;
        } else if (value.toLowerCase() === 'false') {
          frontmatter[key] = false;
        } else if (!isNaN(Number(value)) && value !== '') {
          frontmatter[key] = Number(value);
        } else {
          // Remove wrapping quotes
          frontmatter[key] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    }
  }

  return { frontmatter, content };
}

/**
 * Extracts bi-directional Wiki-links [[Target Note]] and [[Target Note|Alias]]
 * @param {string} text - Markdown text
 * @returns {Array<{ raw: string, target: string, alias: string, slug: string }>}
 */
export function extractWikiLinks(text = '') {
  const wikiLinkRegex = /\[\[([^[\]|]+?)(?:\|([^[\]|]+?))?\]\]/g;
  const links = [];
  const seen = new Set();
  let match;

  while ((match = wikiLinkRegex.exec(text)) !== null) {
    const raw = match[0];
    const target = match[1].trim();
    const alias = match[2] ? match[2].trim() : target;
    const slug = slugify(target);

    const key = `${target.toLowerCase()}|${alias.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      links.push({ raw, target, alias, slug });
    }
  }

  return links;
}

/**
 * Extracts hashtag tags from text and merges with frontmatter tags
 * @param {string} text - Markdown content
 * @param {Array<string>} [fmTags=[]] - Tags from frontmatter
 * @returns {string[]} Deduplicated array of tags without '#'
 */
export function extractTags(text = '', fmTags = []) {
  const tagSet = new Set();

  if (Array.isArray(fmTags)) {
    fmTags.forEach(t => {
      if (typeof t === 'string' && t.trim()) {
        tagSet.add(t.trim().replace(/^#/, '').toLowerCase());
      }
    });
  } else if (typeof fmTags === 'string' && fmTags.trim()) {
    fmTags.split(',').forEach(t => {
      if (t.trim()) tagSet.add(t.trim().replace(/^#/, '').toLowerCase());
    });
  }

  // Regex matches `#tag` or `#category/subtag`, not preceded by non-whitespace, not header (# Title)
  const tagRegex = /(?:^|\s)#([a-zA-Z0-9_\-\/]+)(?=\s|$|[.,!?;:])/g;
  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    const tag = match[1].trim().toLowerCase();
    // Exclude single numbers or pure punctuation
    if (!/^\d+$/.test(tag) && tag.length > 1) {
      tagSet.add(tag);
    }
  }

  return Array.from(tagSet);
}

/**
 * Generates URL-friendly slug
 * @param {string} text
 * @returns {string}
 */
export function slugify(text = '') {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * Converts Markdown text into rich HTML with WikiLink and Tag support
 * @param {string} md - Markdown content (without frontmatter)
 * @returns {string} Safe HTML string
 */
export function markdownToHtml(md = '') {
  if (!md) return '';

  let html = md.replace(/\r\n/g, '\n');

  // Protect code blocks first
  const codeBlocks = [];
  html = html.replace(/```([a-zA-Z0-9_\-]+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const id = `__CODE_BLOCK_${codeBlocks.length}__`;
    const escapedCode = escapeHtml(code.trimEnd());
    const langAttr = lang ? ` class="language-${lang}"` : '';
    const badge = lang ? `<span class="code-lang-badge">${lang}</span>` : '';
    codeBlocks.push(
      `<div class="code-block-wrapper">${badge}<pre><code${langAttr}>${escapedCode}</code></pre></div>`
    );
    return id;
  });

  // Protect inline code
  const inlineCodes = [];
  html = html.replace(/`([^`\n]+)`/g, (match, code) => {
    const id = `__INLINE_CODE_${inlineCodes.length}__`;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return id;
  });

  // Protect math blocks $$...$$
  const mathBlocks = [];
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    const id = `__MATH_BLOCK_${mathBlocks.length}__`;
    mathBlocks.push(`<div class="math-block"><span class="math-tex">\\[${escapeHtml(formula.trim())}\\]</span></div>`);
    return id;
  });

  // Protect inline math $...$
  const inlineMaths = [];
  html = html.replace(/(?<!\\)\$([^\$\n]+?)\$/g, (match, formula) => {
    const id = `__INLINE_MATH_${inlineMaths.length}__`;
    inlineMaths.push(`<span class="math-inline">\\(${escapeHtml(formula.trim())}\\)</span>`);
    return id;
  });

  // Callouts: > [!NOTE], > [!TIP], > [!WARNING], > [!IMPORTANT], > [!CAUTION]
  html = html.replace(
    /^>\s*\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION|INFO)\]\s*([^\n]*)\n((?:^>.*(?:\n|$))*)/gim,
    (match, type, title, bodyLines) => {
      const typeLower = type.toLowerCase();
      const headerTitle = title.trim() || type.toUpperCase();
      const body = bodyLines
        .split('\n')
        .map(l => l.replace(/^>\s?/, ''))
        .join('\n')
        .trim();
      return `<div class="callout callout-${typeLower}"><div class="callout-title"><span class="callout-icon"></span><strong>${escapeHtml(headerTitle)}</strong></div><div class="callout-content">${body}</div></div>\n`;
    }
  );

  // Standard Blockquotes
  html = html.replace(/^(?:> ?[^\n]*(?:\n|$))+/gm, (match) => {
    const content = match
      .split('\n')
      .map(line => line.replace(/^> ?/, ''))
      .join('\n')
      .trim();
    return `<blockquote>${content}</blockquote>\n`;
  });

  // Tables
  html = html.replace(
    /((?:^\|[^\n]+\|\r?\n)+)/gm,
    (tableBlock) => {
      const lines = tableBlock.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return tableBlock;

      const headerLine = lines[0];
      const sepLine = lines[1];

      if (!sepLine.includes('---')) return tableBlock;

      const headers = headerLine
        .split('|')
        .slice(1, -1)
        .map(h => `<th>${h.trim()}</th>`)
        .join('');

      let bodyRows = '';
      for (let i = 2; i < lines.length; i++) {
        const rowCells = lines[i]
          .split('|')
          .slice(1, -1)
          .map(c => `<td>${c.trim()}</td>`)
          .join('');
        bodyRows += `<tr>${rowCells}</tr>`;
      }

      return `<div class="table-container"><table><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table></div>\n`;
    }
  );

  // Horizontal Rules
  html = html.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr />');

  // Headings
  html = html.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, title) => {
    const level = hashes.length;
    const anchorId = slugify(title);
    return `<h${level} id="${anchorId}">${title.trim()}<a class="header-anchor" href="#${anchorId}">#</a></h${level}>`;
  });

  // Task lists
  html = html.replace(/^\s*-\s+\[( |x|X)\]\s+(.+)$/gm, (match, state, text) => {
    const checked = state.toLowerCase() === 'x' ? 'checked disabled' : 'disabled';
    return `<li class="task-list-item"><input type="checkbox" ${checked} /> ${text.trim()}</li>`;
  });

  // Unordered Lists
  html = html.replace(/(?:^[ \t]*[-*+]\s+[^\n]+(?:\n|$))+/gm, (match) => {
    const items = match
      .trim()
      .split('\n')
      .map(line => {
        const itemContent = line.replace(/^[ \t]*[-*+]\s+/, '');
        if (itemContent.startsWith('<li class="task-list-item"')) return itemContent;
        return `<li>${itemContent}</li>`;
      })
      .join('\n');
    return `<ul>\n${items}\n</ul>\n`;
  });

  // Ordered Lists
  html = html.replace(/(?:^[ \t]*\d+\.\s+[^\n]+(?:\n|$))+/gm, (match) => {
    const items = match
      .trim()
      .split('\n')
      .map(line => `<li>${line.replace(/^[ \t]*\d+\.\s+/, '')}</li>`)
      .join('\n');
    return `<ol>\n${items}\n</ol>\n`;
  });

  // Bold & Italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // WikiLinks: [[Target Note|Custom Alias]] or [[Target Note]]
  html = html.replace(/\[\[([^[\]|]+?)(?:\|([^[\]|]+?))?\]\]/g, (match, target, alias) => {
    const cleanTarget = target.trim();
    const display = (alias ? alias.trim() : cleanTarget);
    const targetSlug = slugify(cleanTarget);
    return `<a class="wikilink" data-target="${escapeHtml(cleanTarget)}" href="#/note/${targetSlug}" title="WikiLink to '${escapeHtml(cleanTarget)}'"><span class="wikilink-bracket">[[</span><span class="wikilink-label">${display}</span><span class="wikilink-bracket">]]</span></a>`;
  });

  // Tags: #neuroscience or #ai/nlp
  html = html.replace(/(?:^|\s)#([a-zA-Z0-9_\-\/]+)(?=\s|$|[.,!?;:])/g, (match, tag) => {
    if (/^\d+$/.test(tag)) return match;
    const cleanTag = tag.trim().toLowerCase();
    return ` <span class="tag-pill" data-tag="${cleanTag}">#${cleanTag}</span>`;
  });

  // Markdown links: [title](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Paragraphs: Wrap lines that are not already tags
  const blocks = html.split(/\n{2,}/);
  html = blocks
    .map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<ol') ||
        trimmed.startsWith('<blockquote') ||
        trimmed.startsWith('<div') ||
        trimmed.startsWith('<hr') ||
        trimmed.startsWith('<table') ||
        trimmed.startsWith('__CODE_BLOCK_') ||
        trimmed.startsWith('__MATH_BLOCK_')
      ) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
    })
    .filter(Boolean)
    .join('\n\n');

  // Restore protected blocks
  html = html.replace(/__MATH_BLOCK_(\d+)__/g, (m, id) => mathBlocks[Number(id)] || '');
  html = html.replace(/__INLINE_MATH_(\d+)__/g, (m, id) => inlineMaths[Number(id)] || '');
  html = html.replace(/__CODE_BLOCK_(\d+)__/g, (m, id) => codeBlocks[Number(id)] || '');
  html = html.replace(/__INLINE_CODE_(\d+)__/g, (m, id) => inlineCodes[Number(id)] || '');

  return html;
}

/**
 * Escapes HTML entities
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Extracts a concise summary/excerpt from markdown
 * @param {string} text - Clean text without frontmatter
 * @param {number} [length=180] - Max character length
 * @returns {string}
 */
export function extractExcerpt(text = '', length = 180) {
  const stripped = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[\[(.*?)\]\]/g, '$1')
    .replace(/#[a-zA-Z0-9_\-\/]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*`_~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (stripped.length <= length) return stripped;
  return stripped.slice(0, length).trim() + '...';
}
