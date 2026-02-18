const DEFAULT_RULES = [
  { prefix: 'T ', className: 'code-line-task', color: '#1D4ED8' },
  { prefix: 'N ', className: 'code-line-note', color: '#1E7A3E' },
  { prefix: 'M ', className: 'code-line-milestone', color: '#800000' },
  { prefix: '# ', className: 'code-line-heading', color: '#212529', weight: '700' },
  { prefix: 'X ', className: 'code-line-done', color: '#6C757D' },
];

function normalizeNewlines(text = '') {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function escapeHtml(text = '') {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegex(text = '') {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceOutsideTags(html, regex, replacer) {
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => (part.startsWith('<') ? part : part.replace(regex, replacer)))
    .join('');
}

function replaceOutsideLinks(html, regex, replacer) {
  return html
    .split(/(<a\b[^>]*>.*?<\/a>)/gis)
    .map((part) => (part.toLowerCase().startsWith('<a') ? part : replaceOutsideTags(part, regex, replacer)))
    .join('');
}

function linkifyUrls(text = '') {
  const urlPattern = /(?:https?:\/\/|www\.)[^\s<]+/gi;
  return text.replace(urlPattern, (match) => {
    const trailingMatch = match.match(/^(.*?)([)\].,!?;:]+)$/);
    const url = trailingMatch ? trailingMatch[1] : match;
    const trailing = trailingMatch ? trailingMatch[2] : '';
    if (!url) return match;
    const href = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
    return `<a class="inline-link" href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
  });
}

function pickRules(lineRules) {
  if (Array.isArray(lineRules) && lineRules.length) {
    return lineRules;
  }
  return DEFAULT_RULES;
}

function hexToRgba(hex, alpha) {
  const safeAlpha = Math.max(0, Math.min(1, Number(alpha)));
  const match = String(hex || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return `rgba(253, 169, 13, ${safeAlpha})`;
  }
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

function buildDateRegexes(dateFormats = []) {
  if (!Array.isArray(dateFormats)) {
    return [];
  }

  const tokenMap = {
    DD: '(0?[1-9]|[12][0-9]|3[01])',
    D: '(0?[1-9]|[12][0-9]|3[01])',
    MMMM: '(January|February|March|April|May|June|July|August|September|October|November|December)',
    MMM: '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)',
    MM: '(0?[1-9]|1[0-2])',
    M: '(0?[1-9]|1[0-2])',
    YYYY: '\\d{4}',
    YY: '\\d{2}',
  };

  function toRegexString(format) {
    if (typeof format !== 'string' || !format.trim()) {
      return null;
    }
    const trimmed = format.trim();
    const tokenPattern = /(DD|D|MMMM|MMM|MM|M|YYYY|YY)/g;
    let lastIndex = 0;
    let match;
    const parts = [];

    while ((match = tokenPattern.exec(trimmed))) {
      const textBefore = trimmed.slice(lastIndex, match.index);
      if (textBefore) {
        parts.push(escapeRegex(textBefore));
      }
      const replacement = tokenMap[match[0]];
      if (!replacement) {
        return null;
      }
      parts.push(replacement);
      lastIndex = tokenPattern.lastIndex;
    }

    const trailing = trimmed.slice(lastIndex);
    if (trailing) {
      parts.push(escapeRegex(trailing));
    }
    if (!parts.length) {
      return null;
    }
    return `\\b${parts.join('')}\\b`;
  }

  return dateFormats
    .map(toRegexString)
    .filter(Boolean)
    .map((pattern) => new RegExp(pattern, 'giu'));
}

function capitalizeMonths(text = '') {
  const monthPattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi;
  return text.replace(monthPattern, (match) => match.charAt(0).toUpperCase() + match.slice(1).toLowerCase());
}

function highlightHtml(text = '', dateRegexes = []) {
  const escaped = escapeHtml(text);
  const withLinks = linkifyUrls(escaped);
  const withHashtags = replaceOutsideLinks(
    withLinks,
    /#([\p{L}\p{N}_-]+)(?=$|[^\p{L}\p{N}_-])/gu,
    '<span class="inline-hashtag">#$1</span>',
  );
  const withDates = Array.isArray(dateRegexes) && dateRegexes.length
    ? dateRegexes.reduce((prev, regex) => replaceOutsideLinks(prev, regex, (match) => `<span class="inline-date">${capitalizeMonths(match)}</span>`), withHashtags)
    : withHashtags;
  return withDates.replace(/(&lt;\/?)([a-zA-Z0-9-]+)([^&]*?)(&gt;)/g, (_, open, tag, attrs, close) => {
    const highlightedAttrs = (attrs || '').replace(
      /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*)("[^"]*"|[^\s"'<>]+)/g,
      '<span class="token attr-name">$1</span>$2<span class="token attr-value">$3</span>',
    );
    return `<span class="token tag">${open}<span class="token tag-name">${tag}</span>${highlightedAttrs}${close}</span>`;
  });
}

function wrapLinesWithColors(highlightedHtml, rawText, lineRules) {
  const rulesToUse = pickRules(lineRules);
  const highlightedLines = highlightedHtml.split('\n');
  const rawLines = rawText.split('\n');

  return highlightedLines
    .map((line, index) => {
      const raw = rawLines[index] || '';
      const classes = ['code-line'];
      const styles = [];
      const trimmed = raw.replace(/^[\t ]+/, '');
      const matchedRule = rulesToUse.find((rule) => rule && typeof rule.prefix === 'string' && trimmed.startsWith(rule.prefix));

      if (matchedRule) {
        if (matchedRule.className) classes.push(matchedRule.className);
        if (matchedRule.color) styles.push(`color: ${matchedRule.color};`);
        if (matchedRule.weight) styles.push(`font-weight: ${matchedRule.weight};`);
      }

      const content = line === '' ? '&#8203;' : line;
      const styleAttr = styles.length ? ` style="${styles.join(' ')}"` : '';
      return `<div class="${classes.join(' ')}"${styleAttr}>${content}</div>`;
    })
    .join('');
}

function applyCapitalization(text, shouldCapitalize, lineRules) {
  if (!shouldCapitalize) {
    return text;
  }

  const rulesToUse = pickRules(lineRules);
  const lines = text.split('\n');
  const updatedLines = lines.map((line) => {
    const trimmed = line.replace(/^[\t ]+/, '');
    const matchesRule = rulesToUse.some((rule) => rule && typeof rule.prefix === 'string' && trimmed.startsWith(rule.prefix));
    if (!matchesRule) {
      return line;
    }

    const leadingMatch = line.match(/^[\t ]*/);
    const leading = leadingMatch ? leadingMatch[0] : '';
    let updated = line.slice(leading.length);

    const firstLetterIndex = updated.search(/[A-Za-z]/);
    if (firstLetterIndex !== -1) {
      updated = updated.slice(0, firstLetterIndex)
        + updated[firstLetterIndex].toUpperCase()
        + updated.slice(firstLetterIndex + 1);
    }

    const prefixSpaceIndex = updated.indexOf(' ');
    if (prefixSpaceIndex !== -1) {
      const afterPrefix = updated.slice(prefixSpaceIndex + 1);
      const contentLetterIndex = afterPrefix.search(/[A-Za-z]/);
      if (contentLetterIndex !== -1) {
        const absoluteIndex = prefixSpaceIndex + 1 + contentLetterIndex;
        updated = updated.slice(0, absoluteIndex)
          + updated[absoluteIndex].toUpperCase()
          + updated.slice(absoluteIndex + 1);
      }
    }

    return leading + updated;
  });

  return updatedLines.join('\n');
}

function findUrlAtPosition(value, position) {
  if (typeof value !== 'string' || typeof position !== 'number') {
    return null;
  }
  const urlPattern = /(?:https?:\/\/|www\.)[^\s<]+/gi;
  let match;
  while ((match = urlPattern.exec(value))) {
    const raw = match[0];
    const trailingMatch = raw.match(/^(.*?)([)\].,!?;:]+)$/);
    const clean = trailingMatch ? trailingMatch[1] : raw;
    const start = match.index;
    const end = start + clean.length;
    if (clean && position >= start && position < end) {
      const href = clean.startsWith('http://') || clean.startsWith('https://') ? clean : `https://${clean}`;
      return { href, text: clean };
    }
  }
  return null;
}

function getCaretPositionRect(target) {
  if (!target || typeof target.selectionStart !== 'number') return null;

  const baseRect = target.getBoundingClientRect();
  const mirror = document.createElement('div');
  const computed = window.getComputedStyle(target);
  const properties = [
    'boxSizing',
    'width',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'lineHeight',
    'textTransform',
    'textDecoration',
    'textAlign',
    'tabSize',
    'whiteSpace',
    'wordBreak',
    'overflowWrap',
  ];

  properties.forEach((prop) => {
    mirror.style[prop] = computed[prop];
  });

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflow = 'auto';
  mirror.style.left = `${baseRect.left + window.scrollX}px`;
  mirror.style.top = `${baseRect.top + window.scrollY}px`;
  mirror.textContent = (target.value || '').slice(0, target.selectionStart);

  const caretSpan = document.createElement('span');
  caretSpan.textContent = '\u200b';
  mirror.appendChild(caretSpan);

  document.body.appendChild(mirror);
  const caretRect = caretSpan.getBoundingClientRect();
  document.body.removeChild(mirror);

  return {
    left: caretRect.left + window.scrollX,
    right: caretRect.right + window.scrollX,
    top: caretRect.top + window.scrollY,
    bottom: caretRect.bottom + window.scrollY,
    width: baseRect.width,
  };
}

export function initTaskDescriptionEditor(details, queueSave, options = {}) {
  if (!details) {
    return { updateDescription: () => '' };
  }

  const textarea = details.querySelector('textarea');
  const preview = details.querySelector('code');
  if (!textarea || !preview) {
    return { updateDescription: () => '' };
  }

  const save = typeof queueSave === 'function' ? queueSave : () => {};
  const lineRules = pickRules(options.lineRules);
  const dateRegexes = buildDateRegexes(options.dateFormats);
  const capitalizeSentences = !!options.capitalizeSentences;

  if (options.textColor) {
    details.style.setProperty('--details-text-color', options.textColor);
  }
  if (options.dateColor) {
    details.style.setProperty('--inline-date-color', options.dateColor);
    details.style.setProperty('--inline-date-background', hexToRgba(options.dateColor, 0.12));
    details.style.setProperty('--inline-date-border', hexToRgba(options.dateColor, 0.28));
  }

  function syncDescription() {
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const text = normalizeNewlines(textarea.value || '');
    const capitalized = applyCapitalization(text, capitalizeSentences, lineRules);
    if (capitalized !== textarea.value) {
      textarea.value = capitalized;
      if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
        textarea.selectionStart = selectionStart;
        textarea.selectionEnd = selectionEnd;
      }
    }
    preview.innerHTML = wrapLinesWithColors(highlightHtml(capitalized, dateRegexes), capitalized, lineRules);
    return capitalized;
  }

  function insertAtSelection(text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value || '';
    const nextValue = value.slice(0, start) + text + value.slice(end);
    textarea.value = nextValue;
    const nextPos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = nextPos;
    return nextValue;
  }

  const linkActions = document.createElement('div');
  linkActions.className = 'link-actions-popover d-none';
  const openLinkBtn = document.createElement('button');
  openLinkBtn.type = 'button';
  openLinkBtn.className = 'btn btn-sm btn-primary';
  openLinkBtn.textContent = 'Open link in new tab';
  const cancelLinkBtn = document.createElement('button');
  cancelLinkBtn.type = 'button';
  cancelLinkBtn.className = 'btn btn-sm btn-outline-secondary';
  cancelLinkBtn.textContent = 'Cancel';
  linkActions.appendChild(openLinkBtn);
  linkActions.appendChild(cancelLinkBtn);
  document.body.appendChild(linkActions);
  let activeLinkHref = '';

  function hideLinkActions() {
    activeLinkHref = '';
    openLinkBtn.dataset.href = '';
    linkActions.classList.add('d-none');
  }

  function showLinkActions(href, clientX, clientY) {
    if (!href) {
      hideLinkActions();
      return;
    }
    activeLinkHref = href;
    openLinkBtn.dataset.href = href;
    const maxLeft = Math.max(8, window.innerWidth - 220);
    const maxTop = Math.max(8, window.innerHeight - 96);
    const left = Math.min(Math.max(8, clientX + 8), maxLeft);
    const top = Math.min(Math.max(8, clientY + 8), maxTop);
    linkActions.style.left = `${left}px`;
    linkActions.style.top = `${top}px`;
    linkActions.classList.remove('d-none');
  }

  textarea.addEventListener('input', () => {
    syncDescription();
    save();
    hideLinkActions();
  });

  textarea.addEventListener('click', (event) => {
    if (textarea.selectionStart !== textarea.selectionEnd) {
      hideLinkActions();
      return;
    }
    const pos = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : 0;
    const hit = findUrlAtPosition(textarea.value || '', pos);
    if (!hit) {
      hideLinkActions();
      return;
    }
    showLinkActions(hit.href, event.clientX, event.clientY);
  });

  textarea.addEventListener('scroll', () => {
    preview.parentElement.scrollTop = textarea.scrollTop;
    preview.parentElement.scrollLeft = textarea.scrollLeft;
    hideLinkActions();
  });

  textarea.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
    insertAtSelection(text);
    syncDescription();
    save();
  });

  textarea.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' || event.key === 'Esc') {
      hideLinkActions();
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (start === end && !event.shiftKey) {
        insertAtSelection('\t');
        syncDescription();
        save();
        return;
      }

      const value = textarea.value || '';
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lineEndIndex = value.indexOf('\n', end);
      const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
      const selectedLines = value.slice(lineStart, lineEnd).split('\n');

      if (event.shiftKey) {
        let totalRemoved = 0;
        let firstLineRemoved = 0;
        const outdented = selectedLines
          .map((line, index) => {
            const match = line.match(/^(\t| {1,4})/);
            if (!match) return line;
            const removed = match[0].length;
            totalRemoved += removed;
            if (index === 0) firstLineRemoved = removed;
            return line.slice(removed);
          })
          .join('\n');

        textarea.value = value.slice(0, lineStart) + outdented + value.slice(lineEnd);
        const nextStart = Math.max(lineStart, start - firstLineRemoved);
        const nextEnd = Math.max(nextStart, end - totalRemoved);
        textarea.selectionStart = nextStart;
        textarea.selectionEnd = nextEnd;
      } else {
        const indented = selectedLines.map((line) => `\t${line}`).join('\n');
        textarea.value = value.slice(0, lineStart) + indented + value.slice(lineEnd);
        textarea.selectionStart = start + 1;
        textarea.selectionEnd = end + selectedLines.length;
      }

      syncDescription();
      save();
    } else if (event.key === 'Home' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const caret = textarea.selectionStart;
      const value = textarea.value || '';
      const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
      const lineEnd = value.indexOf('\n', lineStart);
      const endIndex = lineEnd === -1 ? value.length : lineEnd;
      let firstVisible = lineStart;
      while (firstVisible < endIndex && (value[firstVisible] === ' ' || value[firstVisible] === '\t')) {
        firstVisible += 1;
      }
      const target = caret !== firstVisible ? firstVisible : lineStart;

      if (event.shiftKey) {
        const anchor = textarea.selectionEnd;
        textarea.selectionStart = Math.min(anchor, target);
        textarea.selectionEnd = Math.max(anchor, target);
      } else {
        textarea.selectionStart = textarea.selectionEnd = target;
      }
    } else if (event.key === ' ') {
      const start = textarea.selectionStart;
      if (start > 0 && textarea.selectionStart === textarea.selectionEnd && textarea.value[start - 1] === ' ') {
        event.preventDefault();
        textarea.selectionStart = start - 1;
        textarea.selectionEnd = start;
        insertAtSelection('\t');
        syncDescription();
        save();
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const start = textarea.selectionStart;
      const value = textarea.value || '';
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const currentLine = value.slice(lineStart, start);
      const leading = (currentLine.match(/^[\t ]*/) || [''])[0];
      insertAtSelection(`\n${leading}`);
      syncDescription();
      save();
    }
  });

  openLinkBtn.addEventListener('click', () => {
    const href = openLinkBtn.dataset.href || activeLinkHref;
    if (!href) return;
    const opened = window.open(href, '_blank', 'noopener,noreferrer');
    if (opened && typeof opened.focus === 'function') {
      opened.focus();
    }
    hideLinkActions();
  });

  cancelLinkBtn.addEventListener('click', hideLinkActions);

  document.addEventListener('click', (event) => {
    if (linkActions.classList.contains('d-none')) return;
    if (linkActions.contains(event.target)) return;
    if (event.target === textarea) return;
    hideLinkActions();
  });

  window.addEventListener('resize', hideLinkActions);
  window.addEventListener('scroll', hideLinkActions, { passive: true });

  syncDescription();
  return { updateDescription: syncDescription };
}

export { normalizeNewlines };
