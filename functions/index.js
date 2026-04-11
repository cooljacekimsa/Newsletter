'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { crawl } = require('./crawler');
const { deduplicate } = require('./deduplicator');
const { generateNewsletter } = require('./newsletterGenerator');

admin.initializeApp();
const db = admin.firestore();

const REGION = 'asia-northeast3';

const DEFAULT_PUBLISHERS = [
  '연합뉴스', 'KBS', 'MBC', 'SBS', '중앙일보', '한겨레',
  '한국일보', '조선일보', '동아일보', '경향신문',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function writeLog(level, message, url = null) {
  try {
    await db.collection('logs').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      level,
      message,
      url: url || null,
    });
  } catch (e) {
    console.error('log write failed:', e.message);
  }
}

async function loadSettings() {
  const snap = await db.collection('settings').doc('global').get();
  return snap.exists ? snap.data() : {};
}

// ── crawlNews ─────────────────────────────────────────────────────────────────

exports.crawlNews = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (data) => {
    try {
      const settings = await loadSettings();

      const hoursBack = data.hoursBack ?? settings.hoursBack ?? 24;
      const keywords = data.keywords ?? settings.keywords ?? {};
      const seedUrls = data.seedUrls ?? settings.seedUrls ?? [];
      const publisherPriority = settings.publishers ?? DEFAULT_PUBLISHERS;
      const threshold = settings.similarityThreshold ?? 0.75;

      const logFn = (level, msg, url) => writeLog(level, msg, url);

      await writeLog('info', `Crawl started: hoursBack=${hoursBack}`);

      // 1. Crawl
      const articles = await crawl({ seedUrls, hoursBack, keywords, logFn });
      await writeLog('info', `Crawled ${articles.length} articles`);

      // 2. Deduplicate
      const groups = deduplicate(articles, publisherPriority, threshold);
      await writeLog('info', `Dedup groups: ${groups.length}`);

      // 3. Generate newsletter
      const content = generateNewsletter(groups);

      // 4. Persist newsletter doc
      const nlRef = await db.collection('newsletters').add({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        content,
        articleCount: groups.length,
        totalCrawled: articles.length,
        hoursBack,
        source: 'manual',
      });

      // 5. Persist articles in batches of 500
      const allArticles = groups.flatMap(({ representative: r, duplicates }) => [
        { ...r, groupId: nlRef.id, isRepresentative: true },
        ...duplicates.map(d => ({ ...d, groupId: nlRef.id, isRepresentative: false })),
      ]);

      for (let i = 0; i < allArticles.length; i += 400) {
        const batch = db.batch();
        for (const art of allArticles.slice(i, i + 400)) {
          const ref = db.collection('articles').doc();
          batch.set(ref, {
            ...art,
            publishedAt: art.publishedAt
              ? admin.firestore.Timestamp.fromDate(new Date(art.publishedAt))
              : null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }

      await writeLog('info', `Newsletter saved: ${nlRef.id}`);

      return {
        success: true,
        newsletterId: nlRef.id,
        articleCount: groups.length,
        totalCrawled: articles.length,
        content,
      };
    } catch (err) {
      await writeLog('error', `crawlNews error: ${err.message}`);
      throw new functions.https.HttpsError('internal', err.message);
    }
  });

// ── getNewsletters ────────────────────────────────────────────────────────────

exports.getNewsletters = functions
  .region(REGION)
  .https.onCall(async (data) => {
    const limit = Math.min(data?.limit ?? 10, 50);
    const snap = await db.collection('newsletters')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
        articleCount: d.articleCount ?? 0,
        totalCrawled: d.totalCrawled ?? 0,
        hoursBack: d.hoursBack ?? 24,
        content: d.content ?? '',
      };
    });
  });

// ── getSettings ───────────────────────────────────────────────────────────────

exports.getSettings = functions
  .region(REGION)
  .https.onCall(async () => {
    const settings = await loadSettings();
    return {
      keywords: settings.keywords ?? { include: [], exclude: [], mode: 'AND' },
      publishers: settings.publishers ?? DEFAULT_PUBLISHERS,
      seedUrls: settings.seedUrls ?? ['https://www.yna.co.kr/ubuntu/index'],
      hoursBack: settings.hoursBack ?? 24,
      similarityThreshold: settings.similarityThreshold ?? 0.75,
      scheduleEnabled: settings.scheduleEnabled ?? true,
    };
  });

// ── saveSettings ──────────────────────────────────────────────────────────────

exports.saveSettings = functions
  .region(REGION)
  .https.onCall(async (data) => {
    await db.collection('settings').doc('global').set(data, { merge: true });
    return { success: true };
  });

// ── getLogs ───────────────────────────────────────────────────────────────────

exports.getLogs = functions
  .region(REGION)
  .https.onCall(async (data) => {
    const limit = Math.min(data?.limit ?? 100, 500);
    const snap = await db.collection('logs')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        timestamp: d.timestamp?.toDate?.()?.toISOString() ?? null,
        level: d.level ?? 'info',
        message: d.message ?? '',
        url: d.url ?? null,
      };
    });
  });

// ── scheduledCrawl (daily 08:00 KST = 23:00 UTC) ─────────────────────────────

exports.scheduledCrawl = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub.schedule('0 23 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const settings = await loadSettings();
    if (settings.scheduleEnabled === false) return;

    const logFn = (level, msg, url) => writeLog(level, msg, url);
    const publisherPriority = settings.publishers ?? DEFAULT_PUBLISHERS;

    const articles = await crawl({
      seedUrls: settings.seedUrls ?? [],
      hoursBack: settings.hoursBack ?? 24,
      keywords: settings.keywords ?? {},
      logFn,
    });

    const groups = deduplicate(articles, publisherPriority, settings.similarityThreshold ?? 0.75);
    const content = generateNewsletter(groups);

    await db.collection('newsletters').add({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      content,
      articleCount: groups.length,
      totalCrawled: articles.length,
      hoursBack: settings.hoursBack ?? 24,
      source: 'scheduled',
    });

    await writeLog('info', `Scheduled crawl done: ${groups.length} groups`);
  });
