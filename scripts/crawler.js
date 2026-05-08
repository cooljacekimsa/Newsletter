'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

const RSS_TIMEOUT_MS = 15000;

const DEFAULT_SEED_URLS = [
  'https://www.yna.co.kr/ubuntu/index',        // 연합뉴스 아프리카
  'https://www.yna.co.kr/international/index', // 연합뉴스 국제
  'https://www.hani.co.kr/arti/international/', // 한겨레 국제
  'https://www.khan.co.kr/world/',             // 경향신문 세계
];
const RATE_LIMIT_MS = 1000;
const MAX_CONCURRENT = 5;

// 기본 노이즈 문구 — 이 문구가 포함된 단락은 본문에서 제거
const DEFAULT_NOISE_PHRASES = [
  '제보는 카카오톡',
  '저작권자',
  '무단 전재',
  '재판매 및 DB 금지',
  '재판매 및 db 금지',
  '재배포 및 DB 금지',
  '재배포 및 db 금지',
  'AI 학습 및 활용 금지',
  '송고',
];

// 연합뉴스 등 통신사 기자 바이라인 패턴
// 예: "(서울=연합뉴스) 이정훈 기자 = " / "(로마=연합뉴스) 민경락 특파원 = "
const BYLINE_RE = /^\([^)]{1,40}\)\s{0,3}[가-힣·\s,]{1,20}(?:기자|특파원|기자단)\s*=\s*/;

const domainLastRequest = {};

async function waitForRateLimit(domain) {
  const now = Date.now();
  const last = domainLastRequest[domain] || 0;
  const wait = RATE_LIMIT_MS - (now - last);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  domainLastRequest[domain] = Date.now();
}

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

async function fetchUrl(url, { timeout = 12000, responseType = 'text' } = {}) {
  await waitForRateLimit(getDomain(url));
  const res = await axios.get(url, {
    timeout,
    responseType,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AfricaNewsBot/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    },
  });
  return res.data;
}

function parsePublishedTime(html) {
  const $ = cheerio.load(html);
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="article:published_time"]',
    'meta[property="og:article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="DATE"]',
    'time[itemprop="datePublished"]',
    'time[datetime]',
  ];
  for (const sel of selectors) {
    const val = $(sel).attr('content') || $(sel).attr('datetime');
    if (val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

/**
 * 단락 배열을 4단계로 정제합니다:
 * 1) 노이즈 문구가 포함된 단락 제거
 * 2) 사진 캡션 제거 (기자 코드 이메일 포함 단락)
 * 3) 바이라인 이후 전문 추출 (연합뉴스 요약+전문 중복 방지)
 * 4) 중복 단락 제거 (정확 일치 + 앞 30자 근사 중복)
 */
function cleanParagraphs(rawParagraphs, noisePhrases) {
  const noiseList = (noisePhrases && noisePhrases.length)
    ? noisePhrases
    : DEFAULT_NOISE_PHRASES;

  // STEP 1: 노이즈 문구 필터 (대소문자 무시)
  let result = rawParagraphs.filter(p => {
    const lower = p.toLowerCase();
    return !noiseList.some(phrase => lower.includes(phrase.toLowerCase()));
  });

  // STEP 2: 사진 캡션 제거
  // 기자 코드 이메일(예: uwg806@yna.co.kr)이 포함된 단락은 캡션으로 간주
  result = result.filter(p => !/@[a-zA-Z0-9]+\.[a-zA-Z]{2,}/.test(p));

  // STEP 3: 바이라인 이후 전문 추출
  // "(서울=연합뉴스) 이정훈 기자 = ..." 형태의 바이라인이 발견되면
  // 그 이전의 요약 단락을 버리고 바이라인 이후 전문만 사용.
  // 바이라인 접두어 자체는 제거해 본문이 내용으로 바로 시작하게 함.
  const bylineIdx = result.findIndex(p => BYLINE_RE.test(p));
  if (bylineIdx !== -1) {
    result = [
      result[bylineIdx].replace(BYLINE_RE, '').trim(),
      ...result.slice(bylineIdx + 1),
    ].filter(Boolean);
  }

  // STEP 4: 중복 제거 — 정확 일치 + 앞 30자 근사 중복
  // 약간 표현이 다른 동일 내용(예: "자유무역협정" vs "자유무역협정(FTA)")도 제거
  const seenFull = new Set();
  const seenPrefix = new Set();
  return result.filter(p => {
    if (!p || p.length < 10) return false;
    const full = p.replace(/\s+/g, ' ').trim();
    const prefix = full.substring(0, 30);
    if (seenFull.has(full)) return false;
    if (prefix.length >= 25 && seenPrefix.has(prefix)) return false;
    seenFull.add(full);
    if (prefix.length >= 25) seenPrefix.add(prefix);
    return true;
  });
}

function parseArticle(html, url, noisePhrases) {
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('title').text() ||
    '';

  const description =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    '';

  const canonical = $('link[rel="canonical"]').attr('href') || url;

  const publishedAt = parsePublishedTime(html);

  const collectParagraphs = (el, minLen) =>
    cleanParagraphs(
      el.find('p').map((_, p) => $(p).text().trim()).get().filter(t => t.length > minLen),
      noisePhrases
    );

  let body = '';
  const bodySelectors = [
    '.article-txt',           // 연합뉴스
    '.story-news article',    // 연합뉴스
    '#articleBodyContents',   // 한겨레, 다음
    '.article-body-contents', // 한겨레
    '.article_body',          // various
    '.art_body',              // 경향신문
    '.news_body',             // various
    '.news-text-area',        // KBS
    '.detail_body',           // MBC
    '.article-content',       // various
    '.article_txt',           // various
    'article .content',       // generic
    'article',                // fallback
  ];
  for (const sel of bodySelectors) {
    const el = $(sel);
    if (el.length) {
      const paras = collectParagraphs(el, 20);
      const text = paras.join('\n\n');
      if (text.length > 80) { body = text; break; }
    }
  }
  if (!body) {
    const paras = cleanParagraphs(
      $('p').map((_, p) => $(p).text().trim()).get().filter(t => t.length > 30),
      noisePhrases
    );
    body = paras.join('\n\n');
  }

  const source =
    $('meta[property="og:site_name"]').attr('content') ||
    $('meta[name="author"]').attr('content') ||
    getDomain(url).replace(/^www\./, '');

  return {
    title: title.trim(),
    description: description.trim(),
    body: body.trim(),
    url: canonical,
    source,
    publishedAt,
  };
}

function extractArticleLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  const baseDomain = getDomain(baseUrl);

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const abs = new URL(href, baseUrl).toString();
      if (getDomain(abs) !== baseDomain) return;
      if (/\/view\/|\/news\/|\/article\/|\/arti\/|AKR\d+|\/\d{7,}/i.test(abs)) {
        links.add(abs.split('?')[0]);
      }
    } catch { /* ignore */ }
  });

  return [...links];
}

async function crawlSeedUrl(seedUrl, startTime, endTime, logFn, noisePhrases) {
  const articles = [];
  logFn('info', `Fetching index: ${seedUrl}`, seedUrl);

  let indexHtml;
  try {
    indexHtml = await fetchUrl(seedUrl);
  } catch (err) {
    logFn('error', `Cannot fetch seed ${seedUrl}: ${err.message}`, seedUrl);
    return articles;
  }

  const links = extractArticleLinks(indexHtml, seedUrl);
  logFn('info', `Found ${links.length} candidate links from ${seedUrl}`);

  for (let i = 0; i < links.length; i += MAX_CONCURRENT) {
    const batch = links.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.allSettled(
      batch.map(async link => {
        try {
          const html = await fetchUrl(link);
          const art = parseArticle(html, link, noisePhrases);
          if (!art.publishedAt) return null;
          if (art.publishedAt < startTime || art.publishedAt > endTime) return null;
          if (!art.title || art.title.length < 5) return null;
          return art;
        } catch (err) {
          logFn('error', `Article fetch failed: ${err.message}`, link);
          return null;
        }
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) articles.push(r.value);
    }
  }

  return articles;
}

async function crawlRssUrl(rssUrl, startTime, endTime, logFn, noisePhrases) {
  const articles = [];
  logFn('info', `Fetching RSS: ${rssUrl}`, rssUrl);

  let xmlText;
  try {
    xmlText = await fetchUrl(rssUrl, { timeout: RSS_TIMEOUT_MS });
  } catch (err) {
    logFn('error', `Cannot fetch RSS ${rssUrl}: ${err.message}`, rssUrl);
    return articles;
  }

  const $ = cheerio.load(xmlText, { xmlMode: true });
  const items = $('item');
  logFn('info', `RSS ${rssUrl}: found ${items.length} items`);

  const candidates = [];
  items.each((_, el) => {
    // RSS 2.0: <link> text node; Atom: <link href="..."/>; fallback: <guid>
    const linkEl = $(el).find('link');
    const url =
      linkEl.text().trim() ||
      linkEl.attr('href') ||
      $(el).find('guid').text().trim();
    if (!url || !url.startsWith('http')) return;

    const pubDateStr = $(el).find('pubDate').text().trim() ||
                       $(el).find('published').text().trim() ||
                       $(el).find('dc\\:date').text().trim();
    let pubDate = pubDateStr ? new Date(pubDateStr) : null;
    if (pubDate && isNaN(pubDate.getTime())) pubDate = null;

    if (pubDate && (pubDate < startTime || pubDate > endTime)) return;

    candidates.push({ url: url.split('?')[0], pubDate });
  });

  logFn('info', `RSS ${rssUrl}: ${candidates.length} candidates in time range`);

  for (let i = 0; i < candidates.length; i += MAX_CONCURRENT) {
    const batch = candidates.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.allSettled(
      batch.map(async ({ url, pubDate }) => {
        try {
          const html = await fetchUrl(url);
          const art = parseArticle(html, url, noisePhrases);
          if (!art.publishedAt && pubDate) art.publishedAt = pubDate;
          if (!art.publishedAt) return null;
          if (art.publishedAt < startTime || art.publishedAt > endTime) return null;
          if (!art.title || art.title.length < 5) return null;
          return art;
        } catch (err) {
          logFn('error', `RSS article fetch failed: ${err.message}`, url);
          return null;
        }
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) articles.push(r.value);
    }
  }

  return articles;
}

function applyKeywordFilter(articles, keywords) {
  const { include = [], exclude = [], mode = 'AND' } = keywords;
  return articles.filter(art => {
    const text = `${art.title} ${art.description} ${art.body}`.toLowerCase();
    for (const kw of exclude) {
      if (text.includes(kw.toLowerCase())) return false;
    }
    if (!include.length) return true;
    return mode === 'AND'
      ? include.every(kw => text.includes(kw.toLowerCase()))
      : include.some(kw => text.includes(kw.toLowerCase()));
  });
}

async function crawl({ seedUrls, rssUrls, hoursBack = 24, keywords, noisePhrases, logFn }) {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - hoursBack * 3600 * 1000);

  const urls = seedUrls && seedUrls.length ? seedUrls : DEFAULT_SEED_URLS;

  let all = [];
  for (const url of urls) {
    const arts = await crawlSeedUrl(url, startTime, endTime, logFn, noisePhrases);
    all = all.concat(arts);
  }

  for (const url of (rssUrls || [])) {
    const arts = await crawlRssUrl(url, startTime, endTime, logFn, noisePhrases);
    all = all.concat(arts);
  }

  if (keywords) all = applyKeywordFilter(all, keywords);

  return all;
}

module.exports = { crawl };
