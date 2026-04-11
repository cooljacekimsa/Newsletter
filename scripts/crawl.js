'use strict';

const admin = require('firebase-admin');
const { crawl } = require('./crawler');
const { deduplicate } = require('./deduplicator');
const { generateNewsletter } = require('./newsletterGenerator');

const DEFAULT_PUBLISHERS = [
  '연합뉴스', 'KBS', 'MBC', 'SBS', '중앙일보', '한겨레',
  '한국일보', '조선일보', '동아일보', '경향신문',
];

const DEFAULT_SETTINGS = {
  keywords: { include: [], exclude: [], mode: 'AND' },
  publishers: DEFAULT_PUBLISHERS,
  seedUrls: ['https://www.yna.co.kr/ubuntu/index'],
  hoursBack: 24,
  similarityThreshold: 0.75,
};

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

async function main() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
  }

  const serviceAccount = JSON.parse(saJson);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();

  // Load settings from Firestore (fall back to defaults)
  const settingsDoc = await db.collection('settings').doc('global').get();
  const settings = settingsDoc.exists
    ? { ...DEFAULT_SETTINGS, ...settingsDoc.data() }
    : { ...DEFAULT_SETTINGS };

  // Allow hoursBack override from CLI arg
  const cliHours = process.argv[2] ? parseInt(process.argv[2]) : null;
  if (cliHours && !isNaN(cliHours)) settings.hoursBack = cliHours;

  await writeLog('info', `Crawl started — hoursBack=${settings.hoursBack}, seedUrls=${JSON.stringify(settings.seedUrls)}`);

  // 1. Crawl
  const articles = await crawl({
    seedUrls: settings.seedUrls,
    hoursBack: settings.hoursBack,
    keywords: settings.keywords,
    logFn: writeLog,
  });
  await writeLog('info', `Crawled ${articles.length} articles after keyword filter`);

  if (!articles.length) {
    await writeLog('info', 'No articles found — skipping newsletter creation');
    process.exit(0);
  }

  // 2. Deduplicate
  const groups = deduplicate(
    articles,
    settings.publishers || DEFAULT_PUBLISHERS,
    settings.similarityThreshold ?? 0.75,
  );
  await writeLog('info', `Dedup: ${articles.length} → ${groups.length} groups`);

  // 3. Generate newsletter
  const content = generateNewsletter(groups);

  // 4. Save newsletter doc
  const nlRef = await db.collection('newsletters').add({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    content,
    articleCount: groups.length,
    totalCrawled: articles.length,
    hoursBack: settings.hoursBack,
    source: 'github-actions',
  });

  // 5. Save articles in Firestore batches (max 500 ops per batch)
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

  await writeLog('info', `Newsletter ${nlRef.id} saved — ${groups.length} articles`);
  console.log(`✅ Done! Newsletter ID: ${nlRef.id}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
