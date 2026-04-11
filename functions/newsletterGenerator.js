'use strict';

function fmtDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

/**
 * Generates newsletter text from deduplication groups.
 *
 * Format per article:
 *   □ {제목} ({MM}/{DD})
 *   {기사 본문}
 *   #{언론사} {URL}
 *   관련: #{언론사2} URL2  #{언론사3} URL3   (only if duplicates exist)
 *
 * @param {{ representative: object, duplicates: object[] }[]} groups
 * @returns {string}
 */
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
