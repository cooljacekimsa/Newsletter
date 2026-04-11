'use strict';

function fmtDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

function generateNewsletter(groups) {
  const blocks = groups.map(({ representative: r, duplicates }) => {
    const dateStr = fmtDate(r.publishedAt);
    const titleLine = `□ ${r.title}${dateStr ? ` (${dateStr})` : ''}`;
    const body = r.body || r.description || '';
    const sourceLine = `#${r.source}\n${r.url}`;

    let block = `${titleLine}\n${body}\n${sourceLine}`;

    if (duplicates.length) {
      const dupLine = duplicates
        .map(d => `#${d.source} ${d.url}`)
        .join('  ');
      block += `\n관련: ${dupLine}`;
    }

    return block;
  });

  return blocks.join('\n\n' + '─'.repeat(40) + '\n\n');
}

module.exports = { generateNewsletter };
