'use strict';

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

function buildTfIdfVectors(documents) {
  const N = documents.length;

  const tfList = documents.map(doc => {
    const tokens = tokenize(doc);
    const freq = {};
    for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
    const total = tokens.length || 1;
    const tf = {};
    for (const [t, cnt] of Object.entries(freq)) tf[t] = cnt / total;
    return tf;
  });

  const df = {};
  for (const tf of tfList) {
    for (const term of Object.keys(tf)) df[term] = (df[term] || 0) + 1;
  }

  const idf = {};
  for (const [term, cnt] of Object.entries(df)) {
    idf[term] = Math.log((N + 1) / (cnt + 1)) + 1;
  }

  return tfList.map(tf => {
    const vec = {};
    for (const [term, tfVal] of Object.entries(tf)) {
      vec[term] = tfVal * (idf[term] || 1);
    }
    return vec;
  });
}

function cosineSimilarity(v1, v2) {
  let dot = 0, mag1 = 0, mag2 = 0;
  const terms = new Set([...Object.keys(v1), ...Object.keys(v2)]);
  for (const t of terms) {
    const a = v1[t] || 0;
    const b = v2[t] || 0;
    dot += a * b;
    mag1 += a * a;
    mag2 += b * b;
  }
  if (!mag1 || !mag2) return 0;
  return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

function makeUF(n) {
  const p = Array.from({ length: n }, (_, i) => i);
  const find = x => (p[x] === x ? x : (p[x] = find(p[x])));
  const union = (x, y) => { p[find(x)] = find(y); };
  return { find, union };
}

function pickRepresentative(group, publisherPriority) {
  if (group.length === 1) return group[0];
  return [...group].sort((a, b) => {
    const ai = publisherPriority.indexOf(a.source);
    const bi = publisherPriority.indexOf(b.source);
    const ar = ai === -1 ? 9999 : ai;
    const br = bi === -1 ? 9999 : bi;
    if (ar !== br) return ar - br;
    const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bt - at;
  })[0];
}

function deduplicate(articles, publisherPriority = [], threshold = 0.75) {
  if (!articles.length) return [];

  const texts = articles.map(a => `${a.title} ${a.description || ''}`);
  const vectors = buildTfIdfVectors(texts);
  const uf = makeUF(articles.length);

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      if (cosineSimilarity(vectors[i], vectors[j]) >= threshold) {
        uf.union(i, j);
      }
    }
  }

  const groups = {};
  for (let i = 0; i < articles.length; i++) {
    const root = uf.find(i);
    if (!groups[root]) groups[root] = [];
    groups[root].push(articles[i]);
  }

  return Object.values(groups).map(group => ({
    representative: pickRepresentative(group, publisherPriority),
    duplicates: group.filter(
      a => a.url !== pickRepresentative(group, publisherPriority).url
    ),
  }));
}

module.exports = { deduplicate };
