'use strict';

const admin = require('firebase-admin');
const cheerio = require('cheerio');
const { fetchUrl } = require('./crawler');

const DEFAULT_TARGET_URL = 'https://www.hellopeter.com/samsung-south-africa';
const DEFAULT_MAX_PAGES = 3;

let db;

async function writeLog(level, message, url = null) {
  console.log(`[${level.toUpperCase()}] ${message}${url ? ' | ' + url : ''}`);
  try {
    await db.collection('logs').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      level,
      message,
      url: url || null,
    });
  } catch (e) {
    console.error('Log write failed:', e.message);
  }
}

// 리뷰 상세 URL 패턴: /{company-slug}/reviews/{title-slug}-{numericId}
const REVIEW_URL_RE = /\/([^/]+)\/reviews\/([a-z0-9-]+)-(\d+)\/?(?:[?#].*)?$/i;

function parseReviewSlug(url) {
  try {
    const path = new URL(url, 'https://www.hellopeter.com').pathname;
    const m = path.match(REVIEW_URL_RE);
    if (!m) return null;
    const [, companySlug, titleSlugBase, numericId] = m;
    return { companySlug, slug: `${titleSlugBase}-${numericId}`, reviewId: numericId };
  } catch {
    return null;
  }
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return null;
}

// 임베디드 JSON 트리에서 "리뷰 배열처럼 보이는" 노드를 재귀 탐색
// (rating/score + title/heading 필드를 함께 가진 객체들의 배열)
function findReviewArraysInJson(node, found = [], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return found;
  if (Array.isArray(node)) {
    const looksLikeReviews = node.length > 0 && node.every(it =>
      it && typeof it === 'object' &&
      ('rating' in it || 'review_rating' in it || 'score' in it || 'star_rating' in it) &&
      ('title' in it || 'review_title' in it || 'heading' in it)
    );
    if (looksLikeReviews) {
      found.push(node);
    } else {
      node.forEach(it => findReviewArraysInJson(it, found, depth + 1));
    }
    return found;
  }
  for (const key of Object.keys(node)) {
    findReviewArraysInJson(node[key], found, depth + 1);
  }
  return found;
}

function normalizeReviewFromJson(raw, pageUrl) {
  const relUrl = pick(raw, ['permalink', 'url', 'review_url', 'link']);
  let absUrl = null;
  if (relUrl) {
    try { absUrl = new URL(relUrl, pageUrl).toString(); } catch { /* ignore */ }
  }
  const slugInfo = absUrl ? parseReviewSlug(absUrl) : null;
  const idCandidate = pick(raw, ['id', 'review_id', 'reviewId']);
  const reviewId = slugInfo?.reviewId || (idCandidate != null ? String(idCandidate) : null);
  if (!reviewId) return null;

  const ratingRaw = pick(raw, ['rating', 'review_rating', 'score', 'star_rating']);
  const rating = ratingRaw != null ? Number(ratingRaw) : null;

  const dateRaw = pick(raw, ['created', 'created_at', 'date', 'published_at', 'review_date']);
  const postedAt = dateRaw ? new Date(dateRaw) : null;

  return {
    reviewId,
    url: absUrl,
    author: pick(raw, ['author', 'author_name', 'reviewer', 'consumer_name', 'name']),
    rating: Number.isFinite(rating) ? rating : null,
    title: pick(raw, ['title', 'review_title', 'heading']),
    body: pick(raw, ['content', 'review_content', 'body', 'review_body', 'message']),
    postedAt: postedAt && !isNaN(postedAt.getTime()) ? postedAt : null,
  };
}

// Next.js(__NEXT_DATA__ / RSC flight data) 또는 Nuxt(__NUXT__) 임베디드 JSON에서 리뷰 추출
function parseEmbeddedJson($, pageUrl) {
  const candidates = [];

  const nextData = $('#__NEXT_DATA__').html();
  if (nextData) {
    try { candidates.push(JSON.parse(nextData)); } catch { /* not JSON */ }
  }

  $('script').each((_, el) => {
    const text = $(el).html() || '';

    const nuxtMatch = text.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*\});?\s*$/);
    if (nuxtMatch) {
      try { candidates.push(JSON.parse(nuxtMatch[1])); } catch { /* function-form __NUXT__, skip */ }
    }

    for (const fm of text.matchAll(/self\.__next_f\.push\(\[\d+,\s*("(?:[^"\\]|\\.)*")\]\)/g)) {
      try {
        const chunk = JSON.parse(fm[1]);
        const objStart = chunk.indexOf('{');
        const arrStart = chunk.indexOf('[');
        const start = objStart === -1 ? arrStart : (arrStart === -1 ? objStart : Math.min(objStart, arrStart));
        if (start !== -1) {
          try { candidates.push(JSON.parse(chunk.slice(start))); } catch { /* not a clean JSON fragment */ }
        }
      } catch { /* ignore */ }
    }
  });

  const arrays = [];
  for (const c of candidates) findReviewArraysInJson(c, arrays);
  if (!arrays.length) return [];

  arrays.sort((a, b) => b.length - a.length);
  return arrays[0].map(raw => normalizeReviewFromJson(raw, pageUrl)).filter(Boolean);
}

// 임베디드 JSON이 없을 때 DOM에서 리뷰 상세 링크를 기준으로 카드 텍스트를 추정 추출
function parseFromDom($, pageUrl) {
  const reviews = [];
  const seen = new Set();

  $('a[href*="/reviews/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    let absUrl;
    try { absUrl = new URL(href, pageUrl).toString(); } catch { return; }
    const slugInfo = parseReviewSlug(absUrl);
    if (!slugInfo || seen.has(slugInfo.reviewId)) return;

    const card = $(el).closest('article, li, div');
    const text = card.text().replace(/\s+/g, ' ').trim();
    if (text.length < 20) return;

    seen.add(slugInfo.reviewId);
    reviews.push({
      reviewId: slugInfo.reviewId,
      url: absUrl,
      author: null,
      rating: null,
      title: $(el).text().trim() || null,
      body: text.slice(0, 2000),
      postedAt: null,
    });
  });

  return reviews;
}

function buildPageUrl(baseUrl, page) {
  const u = new URL(baseUrl);
  u.searchParams.set('page', String(page));
  return u.toString();
}

async function crawlReviews(targetUrl, maxPages, logFn) {
  const all = [];
  const seenIds = new Set();

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = page === 1 ? targetUrl : buildPageUrl(targetUrl, page);
    logFn('info', `Fetching review page ${page}: ${pageUrl}`, pageUrl);

    let html;
    try {
      html = await fetchUrl(pageUrl);
    } catch (err) {
      logFn('error', `Cannot fetch review page ${page}: ${err.message}`, pageUrl);
      break;
    }

    const $ = cheerio.load(html);
    let pageReviews = parseEmbeddedJson($, pageUrl);
    if (!pageReviews.length) pageReviews = parseFromDom($, pageUrl);

    if (!pageReviews.length) {
      logFn('info', `No reviews found on page ${page} — stopping pagination`, pageUrl);
      break;
    }

    let addedAny = false;
    for (const r of pageReviews) {
      if (seenIds.has(r.reviewId)) continue;
      seenIds.add(r.reviewId);
      all.push(r);
      addedAny = true;
    }
    logFn('info', `Page ${page}: ${pageReviews.length} reviews parsed (total ${all.length})`, pageUrl);
    if (!addedAny) break;
  }

  return all;
}

async function main() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
  }

  const serviceAccount = JSON.parse(saJson);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();

  const settingsDoc = await db.collection('settings').doc('reviewCrawl').get();
  const settings = settingsDoc.exists ? settingsDoc.data() : {};

  const cliUrl = (process.argv[2] || '').trim();
  const targetUrl = cliUrl || settings.targetUrl || DEFAULT_TARGET_URL;
  const maxPages = settings.maxPages || DEFAULT_MAX_PAGES;

  await writeLog('info', `Review crawl started — target=${targetUrl}, maxPages=${maxPages}`);

  const reviews = await crawlReviews(targetUrl, maxPages, writeLog);
  await writeLog('info', `Crawled ${reviews.length} reviews`);

  if (!reviews.length) {
    await writeLog('info', 'No reviews found — skipping save');
    process.exit(0);
  }

  // 직전 run 1건만 조회해 신규 여부를 판별 (전체 이력 누적 비교 아님)
  const prevSnap = await db.collection('reviewCrawls')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  const prevIds = prevSnap.empty
    ? new Set()
    : new Set(prevSnap.docs[0].data().reviewIds || []);

  for (const r of reviews) r.isNew = !prevIds.has(r.reviewId);
  const newCount = reviews.filter(r => r.isNew).length;

  const runRef = await db.collection('reviewCrawls').add({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    source: 'github-actions',
    targetUrl,
    totalReviews: reviews.length,
    newCount,
    reviewIds: reviews.map(r => r.reviewId),
  });

  for (let i = 0; i < reviews.length; i += 400) {
    const batch = db.batch();
    for (const r of reviews.slice(i, i + 400)) {
      const ref = db.collection('reviewItems').doc();
      batch.set(ref, {
        runId: runRef.id,
        reviewId: r.reviewId,
        url: r.url,
        author: r.author,
        rating: r.rating,
        title: r.title,
        body: r.body,
        postedAt: r.postedAt ? admin.firestore.Timestamp.fromDate(r.postedAt) : null,
        isNew: r.isNew,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  await writeLog('info', `Review run ${runRef.id} saved — ${reviews.length}건 (신규 ${newCount}건)`);
  console.log(`✅ Done! Run ID: ${runRef.id}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
