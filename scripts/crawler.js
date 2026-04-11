'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

const DEFAULT_SEED_URLS = ['https://www.yna.co.kr/ubuntu/index'];
const RATE_LIMIT_MS = 1000; // 1 req/sec per domain
const MAX_CONCURRENT = 5;

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

function parseArticle(html, url) {
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
      const text = el
        .find('p')
        .map((_, p) => $(p).text().trim())
        .get()
        .filter(t => t.length > 20)
        .join('\n\n');
      if (text.length > 80) { body = text; break; }
    }
  }
  if (!body) {
    body = $('p')
      .map((_, p) => $(p).text().trim())
      .get()
      .filter(t => t.length > 30)
      .join('\n\n');
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

async function crawlSeedUrl(seedUrl, startTime, endTime, logFn) {
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
          const art = parseArticle(html, link);
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

async function crawl({ seedUrls, hoursBack = 24, keywords, logFn }) {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - hoursBack * 3600 * 1000);

  const urls = seedUrls && seedUrls.length ? seedUrls : DEFAULT_SEED_URLS;

  let all = [];
  for (const url of urls) {
    const arts = await crawlSeedUrl(url, startTime, endTime, logFn);
    all = all.concat(arts);
  }

  if (keywords) all = applyKeywordFilter(all, keywords);

  return all;
}

module.exports = { crawl };
