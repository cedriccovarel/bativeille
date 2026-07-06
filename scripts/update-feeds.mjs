import fs from 'node:fs/promises';
import path from 'node:path';
import Parser from 'rss-parser';

const ROOT = path.resolve(process.cwd());
const parser = new Parser({
  timeout: 20000,
  headers: { 'User-Agent': 'bativeille-bot/1.0' },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['itunes:image', 'itunesImage'],
      ['image', 'image']
    ]
  }
});

const keywordMap = {
  'Réglementation': ['décret', 'arrêté', 'loi', 'réglement', 'norme'],
  'RE2020': ['re2020', 'rset', 'rsee', 'bbio', 'cep', 'cepnr', 'dh'],
  'Carbone': ['carbone', 'acv', 'fdes', 'pep', 'décarbon'],
  'Eau': ['eau', 'hydrique', 'eaux usées', 'eau pluviale'],
  'Confort d’été': ['été', 'canicule', 'surchauffe', 'fraîcheur', 'confort d été'],
  'Économie du bâtiment': ['coût', 'conjoncture', 'marché', 'économie', 'investissement'],
  'Réemploi': ['réemploi', 'reuse'],
  'Biosourcé': ['biosourcé', 'géosourcé', 'terre', 'bois'],
  'Rénovation': ['rénovation', 'rénover', 'copropriété']
};

async function readJson(file) {
  const content = await fs.readFile(path.join(ROOT, file), 'utf8');
  return JSON.parse(content);
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function cleanText(value = '') {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function detectFeedUrl(siteUrl) {
  try {
    const response = await fetch(siteUrl, { headers: { 'User-Agent': 'bativeille-bot/1.0' } });
    const html = await response.text();
    const match = html.match(/<link[^>]+type=["']application\/(?:rss\+xml|atom\+xml)["'][^>]+href=["']([^"']+)["']/i)
      || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/(?:rss\+xml|atom\+xml)["']/i);
    if (!match) return null;
    return new URL(match[1], siteUrl).href;
  } catch {
    return null;
  }
}


function absoluteUrl(url, baseUrl) {
  if (!url) return null;
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return null;
  }
}

function extractFirstImageFromHtml(html = '', baseUrl = '') {
  const srcsetMatch = String(html).match(/<img[^>]+srcset=["']([^"']+)["']/i);
  if (srcsetMatch) {
    const first = srcsetMatch[1].split(',')[0].trim().split(/\s+/)[0];
    const resolved = absoluteUrl(first, baseUrl);
    if (resolved) return resolved;
  }
  const srcMatch = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  return srcMatch ? absoluteUrl(srcMatch[1], baseUrl) : null;
}

function imageFromFeedItem(item, baseUrl) {
  const candidates = [];
  if (item.enclosure?.url) candidates.push(item.enclosure.url);
  if (item.image?.url) candidates.push(item.image.url);
  if (typeof item.image === 'string') candidates.push(item.image);
  if (item.itunesImage?.href) candidates.push(item.itunesImage.href);
  if (item.itunesImage?.url) candidates.push(item.itunesImage.url);

  for (const field of ['mediaContent', 'mediaThumbnail']) {
    const value = item[field];
    const arr = Array.isArray(value) ? value : (value ? [value] : []);
    for (const entry of arr) {
      if (entry?.$?.url) candidates.push(entry.$.url);
      if (entry?.url) candidates.push(entry.url);
    }
  }

  candidates.push(extractFirstImageFromHtml(item.content || item['content:encoded'] || item.summary || '', baseUrl));
  for (const candidate of candidates) {
    const resolved = absoluteUrl(candidate, baseUrl);
    if (resolved && /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(resolved)) return resolved;
    if (resolved) return resolved;
  }
  return null;
}

async function fetchOpenGraphImage(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'bativeille-bot/1.0' } });
    const html = await response.text();
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
      || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (ogMatch) return absoluteUrl(ogMatch[1], url);
    return extractFirstImageFromHtml(html, url);
  } catch {
    return null;
  }
}

function inferTags(text, defaults = []) {
  const hay = cleanText(text).toLowerCase();
  const auto = [];
  for (const [tag, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(keyword => hay.includes(keyword))) auto.push(tag);
  }
  return uniq([...defaults, ...auto]).slice(0, 6);
}

function buildSummary(item) {
  const parts = [
    item.contentSnippet,
    item.content,
    item.summary,
    item.isoDate,
    item.title
  ].filter(Boolean).map(cleanText);
  const full = parts.join(' ');
  if (!full) return 'Résumé indisponible dans le flux. À enrichir manuellement si besoin.';
  return full.slice(0, 280) + (full.length > 280 ? '…' : '');
}

async function fetchSourceEntries(source) {
  const feedUrl = source.rss || await detectFeedUrl(source.siteUrl);
  if (!feedUrl) {
    console.warn(`Aucun flux détecté pour ${source.name}`);
    return [];
  }

  try {
    const feed = await parser.parseURL(feedUrl);
    const items = (feed.items || []).slice(0, 10);
    const articles = [];
    for (const [index, item] of items.entries()) {
      const compositeText = `${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''}`;
      const tags = inferTags(compositeText, source.defaultTags || []);
      const sourceType = source.type || 'Source à qualifier';
      const exactUrl = item.link || item.guid || source.siteUrl;
      const feedImage = imageFromFeedItem(item, exactUrl);
      const image = feedImage || await fetchOpenGraphImage(exactUrl);
      articles.push({
        id: `${source.id}-${index}-${Date.parse(item.isoDate || item.pubDate || new Date().toISOString())}`,
        title: cleanText(item.title || 'Sans titre'),
        source: source.name,
        sourceId: source.id,
        sourceType,
        region: source.region || 'National',
        url: exactUrl,
        image,
        date: (item.isoDate || item.pubDate || new Date().toISOString()).slice(0, 10),
        access: source.official ? 'official' : 'open',
        official: !!source.official,
        highImpact: tags.includes('Réglementation') || tags.includes('RE2020') || tags.includes('Carbone'),
        impactScore: Math.min(100, 50 + tags.length * 8 + (source.official ? 10 : 0)),
        tags,
        summary: buildSummary(item),
        premiumSummary: ''
      });
    }
    return articles;
  } catch (error) {
    console.warn(`Erreur flux ${source.name}: ${error.message}`);
    return [];
  }
}

async function main() {
  const [sources, manualEntries] = await Promise.all([
    readJson('sources.json'),
    readJson('manual_entries.json').catch(() => [])
  ]);

  const activeSources = sources.filter(source => source.active !== false);
  const fetchedGroups = await Promise.all(activeSources.map(fetchSourceEntries));
  const fetchedArticles = fetchedGroups.flat();

  const merged = [...manualEntries, ...fetchedArticles];
  const deduped = [];
  const seen = new Set();
  for (const article of merged) {
    const key = article.url || article.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(article);
  }

  deduped.sort((a, b) => new Date(b.date) - new Date(a.date));

  const payload = {
    sources: activeSources.map(source => ({
      id: source.id,
      name: source.name,
      type: source.type,
      url: source.siteUrl,
      category: source.category || '',
      region: source.region || 'National',
      access: source.access || '',
      official: !!source.official
    })),
    articles: deduped
  };

  const out = `window.BATIVEILLE_DATA = ${JSON.stringify(payload, null, 2)};\n`;
  await fs.writeFile(path.join(ROOT, 'data.js'), out, 'utf8');
  await fs.writeFile(path.join(ROOT, 'data.generated.json'), JSON.stringify(payload, null, 2), 'utf8');
  console.log(`data.js mis à jour avec ${payload.articles.length} article(s).`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
