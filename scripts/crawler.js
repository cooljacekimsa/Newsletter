'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

const DEFAULT_SEED_URLS = ['https://www.yna.co.kr/ubuntu/index'];
const RATE_LIMIT_MS = 1000;
const MAX_CONCURRENT = 5;

// 기본 노이즈 문구 — 이 문구가 포함된 단락은 본문에서 제거
const DEFAULT_NOISE_PHRASES = [
  '제보는 카카오톡',
  '저작권자',
  '무단 전재',
  '재판매 및 DB 금지',
  'AI 학습 및 활용 금지',
  '송고',
  '재판매 및 db 금지',
];

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

async function fetchUrl(url) {
  await waitForRateLimit(getDomain(url));
  const res = await axios.get(url, {
    timeout: 12000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AfricaNewsBot/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
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
 * 단락 배열을 정제합니다:
 * 1) 노이즈 문구가 포함된 단락 제거
 * 2) 중복 단락 제거 (첫 등장만 유지)
 */
function cleanParagraphs(rawParagraphs, noisePhrases) {
  const noiseList = (noisePhrases && noisePhrases.length)
    ? noisePhrases
    : DEFAULT_NOISE_PHRASES;

  // 노이즈 필터 (대소문자 무시)
  const filtered = rawParagraphs.filter(p => {
    const lower = p.toLowerCase();
    return !noiseList.some(phrase => lower.includes(phrase.toLowerCase()));
  });

  // 중복 제거 — 공백 정규화 후 비교, 첫 등장만 유지
  const seen = new Set();
  return filtered.filter(p => {
    const key = p.replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
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
    '.article-txt',
    '.story-news article',
    '#articleBodyContents',
    '.article_body',
    '.news_body',
    '.article-content',
    'article .content',
    'article',
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
      if (/\/view\/|\/news\/|\/article\/|AKR\d+|\/\d{7,}/.test(abs)) {
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

async function crawl({ seedUrls, hoursBack = 24, keywords, noisePhrases, logFn }) {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - hoursBack * 3600 * 1000);

  const urls = seedUrls && seedUrls.length ? seedUrls : DEFAULT_SEED_URLS;

  let all = [];
  for (const url of urls) {
    const arts = await crawlSeedUrl(url, startTime, endTime, logFn, noisePhrases);
    all = all.concat(arts);
  }

  if (keywords) all = applyKeywordFilter(all, keywords);

  return all;
}

module.exports = { crawl };
