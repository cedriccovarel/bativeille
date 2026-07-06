import fs from 'node:fs/promises';
import path from 'node:path';
import Parser from 'rss-parser';

const ROOT = path.resolve(process.cwd());
const USER_AGENT = 'bativeille-bot/1.4 (+https://github.com/)';

const FETCH_TIMEOUT_MS = Number(process.env.BATIVEILLE_FETCH_TIMEOUT_MS || 6500);
const SOURCE_TIMEOUT_MS = Number(process.env.BATIVEILLE_SOURCE_TIMEOUT_MS || 25000);
const CONCURRENCY = Number(process.env.BATIVEILLE_CONCURRENCY || 8);

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['itunes:image', 'itunesImage'],
      ['image', 'image']
    ]
  }
});

const SINCE_DATE = new Date(process.env.BATIVEILLE_SINCE || '2026-07-01T00:00:00.000Z');
const MAX_ITEMS_PER_SOURCE = Number(process.env.BATIVEILLE_MAX_ITEMS || 80);
const MAX_RSS_CANDIDATES = Number(process.env.BATIVEILLE_MAX_RSS_CANDIDATES || 6);
const MAX_API_CANDIDATES = Number(process.env.BATIVEILLE_MAX_API_CANDIDATES || 2);
const MAX_SITEMAP_CANDIDATES = Number(process.env.BATIVEILLE_MAX_SITEMAP_CANDIDATES || 3);
const MAX_SITEMAP_URLS_PER_SOURCE = Number(process.env.BATIVEILLE_MAX_SITEMAP_URLS || 30);
const ENABLE_RSS = process.env.BATIVEILLE_ENABLE_RSS !== 'false';
const ENABLE_WORDPRESS_API = process.env.BATIVEILLE_ENABLE_WORDPRESS_API !== 'false';
const ENABLE_SITEMAP = process.env.BATIVEILLE_ENABLE_SITEMAP !== 'false';
const VERBOSE = process.env.BATIVEILLE_VERBOSE === 'true';

const keywordMap = {
  'Réglementation': ['décret', 'arrêté', 'loi', 'réglement', 'norme', 'bo', 'bulletin officiel'],
  'RE2020': ['re2020', 'rset', 'rsee', 'bbio', 'cep', 'cepnr', 'dh'],
  'Carbone': ['carbone', 'acv', 'fdes', 'pep', 'décarbon'],
  'Eau': ['eau', 'hydrique', 'eaux usées', 'eau pluviale'],
  'Confort d’été': ['été', 'canicule', 'surchauffe', 'fraîcheur', 'confort d été'],
  'Économie du bâtiment': ['coût', 'conjoncture', 'marché', 'économie', 'investissement'],
  'Réemploi': ['réemploi', 'reuse', 'réutilisation'],
  'Biosourcé': ['biosourcé', 'géosourcé', 'terre', 'bois', 'chanvre', 'paille'],
  'Rénovation': ['rénovation', 'rénover', 'copropriété', 'maprimerénov'],
  'Énergie': ['énergie', 'energies', 'enr', 'photovoltaïque', 'solaire', 'chauffage'],
  'Bâtiment': ['bâtiment', 'construction', 'chantier', 'logement']
};

const feedStatus = [];

async function readJson(file) {
  const content = await fs.readFile(path.join(ROOT, file), 'utf8');
  return JSON.parse(content);
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function cleanText(value = '') {
  return decodeHtml(String(value))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(url, baseUrl) {
  if (!url) return null;
  try {
    return new URL(decodeHtml(String(url).trim()), baseUrl).href;
  } catch {
    return null;
  }
}

function sourceBaseUrl(source) {
  return source.siteUrl || source.url || '';
}

async function fetchText(url, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: accept }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,*/*;q=0.8' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCandidates(value, siteUrl) {
  const raw = Array.isArray(value) ? value : (value ? [value] : []);
  return raw.map(candidate => absoluteUrl(candidate, siteUrl)).filter(Boolean);
}

function commonFeedCandidates(siteUrl) {
  const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  return ['feed/', 'rss.xml', 'rss', 'actualites/feed/', 'news/feed/', 'articles/feed/'].map(p => new URL(p, base).href);
}

function commonWpCandidates(siteUrl) {
  const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  return [new URL('wp-json/wp/v2/posts', base).href];
}

function commonSitemapCandidates(siteUrl) {
  const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  return ['sitemap.xml', 'sitemap_index.xml', 'post-sitemap.xml'].map(p => new URL(p, base).href);
}

function getItemDate(item) {
  const rawDate = item.isoDate || item.pubDate || item.date || item.updated || item.published;
  const parsed = rawDate ? new Date(rawDate) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function isSinceCutoffDate(date) {
  return date && date >= SINCE_DATE;
}

function inferTags(text, defaults = []) {
  const hay = cleanText(text).toLowerCase();
  const auto = [];
  for (const [tag, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(keyword => hay.includes(keyword))) auto.push(tag);
  }
  return uniq([...defaults, ...auto]).slice(0, 6);
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
    if (resolved) return resolved;
  }
  return null;
}

function buildSummaryFromText(text) {
  const full = cleanText(text || '');
  if (!full) return 'Résumé indisponible. À enrichir manuellement si besoin.';
  return full.slice(0, 280) + (full.length > 280 ? '…' : '');
}

function baseArticle(source, { idPart, title, url, date, image, summary, tags, method }) {
  return {
    id: `${source.id}-${idPart}-${date?.getTime() || Date.now()}`,
    title: cleanText(title || 'Sans titre'),
    source: source.name,
    sourceId: source.id,
    sourceType: source.type || 'Source à qualifier',
    region: source.region || 'National',
    url: url || sourceBaseUrl(source),
    image: image || null,
    date: (date || new Date()).toISOString().slice(0, 10),
    access: source.official ? 'official' : (source.access || 'open'),
    official: !!source.official,
    highImpact: tags.includes('Réglementation') || tags.includes('RE2020') || tags.includes('Carbone'),
    impactScore: Math.min(100, 48 + tags.length * 8 + (source.official ? 10 : 0)),
    tags,
    summary: buildSummaryFromText(summary),
    premiumSummary: '',
    collectMethod: method
  };
}

function articleFromFeedItem(source, item, index) {
  const date = getItemDate(item);
  const exactUrl = item.link || item.guid || sourceBaseUrl(source);
  const compositeText = `${item.title || ''} ${item.contentSnippet || ''} ${item.content || ''}`;
  const tags = inferTags(compositeText, source.defaultTags || []);
  return baseArticle(source, {
    idPart: `rss-${index}`,
    title: item.title,
    url: exactUrl,
    date,
    image: imageFromFeedItem(item, exactUrl),
    summary: [item.contentSnippet, item.content, item.summary, item.title].filter(Boolean).join(' '),
    tags,
    method: 'rss'
  });
}

function wpImage(post) {
  const media = post?._embedded?.['wp:featuredmedia'];
  if (Array.isArray(media) && media[0]) {
    return media[0].source_url || media[0].media_details?.sizes?.large?.source_url || media[0].media_details?.sizes?.medium?.source_url || null;
  }
  return null;
}

function articleFromWpPost(source, post, index) {
  const date = new Date(post.date_gmt ? `${post.date_gmt}Z` : (post.date || post.modified));
  const title = post.title?.rendered || post.title || 'Sans titre';
  const summary = post.excerpt?.rendered || post.content?.rendered || title;
  const tags = inferTags(`${title} ${summary}`, source.defaultTags || []);
  return baseArticle(source, {
    idPart: `wp-${post.id || index}`,
    title,
    url: post.link || sourceBaseUrl(source),
    date,
    image: wpImage(post),
    summary,
    tags,
    method: 'wordpress_api'
  });
}

function withQuery(url, params) {
  const u = new URL(url);
  for (const [key, value] of Object.entries(params)) u.searchParams.set(key, value);
  return u.href;
}

async function collectByRss(source, status) {
  if (!ENABLE_RSS) return [];
  const siteUrl = sourceBaseUrl(source);
  const candidates = uniq([
    ...normalizeCandidates(source.rss, siteUrl),
    ...normalizeCandidates(source.rssCandidates, siteUrl),
    ...commonFeedCandidates(siteUrl)
  ]).slice(0, MAX_RSS_CANDIDATES);
  status.rssCandidatesTested = candidates.length;

  for (const feedUrl of candidates) {
    try {
      const feed = await parser.parseURL(feedUrl);
      if (!feed?.items?.length) continue;
      const items = feed.items.filter(item => isSinceCutoffDate(getItemDate(item))).slice(0, MAX_ITEMS_PER_SOURCE);
      if (!items.length) {
        status.rssFoundButNoRecent = true;
        status.rssUrl = feedUrl;
        continue;
      }
      status.method = 'rss';
      status.status = 'ok';
      status.urlUsed = feedUrl;
      status.articleCount = items.length;
      return items.map((item, index) => articleFromFeedItem(source, item, index));
    } catch (error) {
      status.lastRssError = error.message;
    }
  }
  return [];
}

async function collectByWordPressApi(source, status) {
  if (!ENABLE_WORDPRESS_API) return [];
  const siteUrl = sourceBaseUrl(source);
  const candidates = uniq([
    ...normalizeCandidates(source.apiCandidates, siteUrl),
    ...commonWpCandidates(siteUrl)
  ]).slice(0, MAX_API_CANDIDATES);
  status.wpApiCandidatesTested = candidates.length;

  for (const apiUrl of candidates) {
    try {
      const url = withQuery(apiUrl, {
        per_page: String(Math.min(MAX_ITEMS_PER_SOURCE, 100)),
        _embed: '1',
        after: SINCE_DATE.toISOString()
      });
      const posts = await fetchJson(url);
      if (!Array.isArray(posts) || !posts.length) continue;
      const articles = posts
        .map((post, index) => articleFromWpPost(source, post, index))
        .filter(article => isSinceCutoffDate(new Date(article.date)))
        .slice(0, MAX_ITEMS_PER_SOURCE);
      if (!articles.length) continue;
      status.method = 'wordpress_api';
      status.status = 'ok';
      status.urlUsed = apiUrl;
      status.articleCount = articles.length;
      return articles;
    } catch (error) {
      status.lastWpApiError = error.message;
    }
  }
  return [];
}

function xmlTagBlocks(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const blocks = [];
  let match;
  while ((match = regex.exec(xml))) blocks.push(match[1]);
  return blocks;
}

function xmlTagValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeHtml(match[1].trim()) : null;
}

function isLikelyArticleUrl(url) {
  const value = String(url || '').toLowerCase();
  if (!value || value.includes('mailto:') || value.includes('javascript:')) return false;
  if (/\.(jpg|jpeg|png|gif|webp|zip|docx?|xlsx?|pptx?|css|js)(\?|#|$)/i.test(value)) return false;
  if (/\.(pdf)(\?|#|$)/i.test(value)) return true;
  return ['/actualite', '/actualites', '/news', '/article', '/articles', '/presse', '/publication', '/publications', '/communique', '/blog', '/veille', '/info', '/dossier', '/ressource', '/ressources', '/etude', '/etudes', '/rapport'].some(marker => value.includes(marker));
}

function titleFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
    return cleanText(last.replace(/[-_]+/g, ' ').replace(/\.(html|php|aspx|pdf)$/i, ' ')) || u.hostname;
  } catch {
    return 'Publication récente';
  }
}

async function parseSitemapUrls(sitemapUrl, depth = 0) {
  const xml = await fetchText(sitemapUrl, 'application/xml,text/xml,*/*;q=0.8');
  const sitemapBlocks = xmlTagBlocks(xml, 'sitemap');
  if (sitemapBlocks.length && depth < 1) {
    const nested = sitemapBlocks
      .map(block => xmlTagValue(block, 'loc'))
      .filter(Boolean)
      .slice(0, 4);
    const all = [];
    for (const nestedUrl of nested) {
      try {
        all.push(...await parseSitemapUrls(nestedUrl, depth + 1));
      } catch {
        // ignore nested sitemap failure
      }
    }
    return all;
  }
  return xmlTagBlocks(xml, 'url').slice(0, 600).map(block => ({
    url: xmlTagValue(block, 'loc'),
    lastmod: xmlTagValue(block, 'lastmod')
  })).filter(entry => entry.url);
}

function articleFromSitemapEntry(source, entry, index) {
  const date = entry.lastmod ? new Date(entry.lastmod) : null;
  if (!date || Number.isNaN(date.getTime()) || date < SINCE_DATE) return null;
  const title = titleFromUrl(entry.url);
  const tags = inferTags(`${title} ${entry.url}`, source.defaultTags || []);
  return baseArticle(source, {
    idPart: `sitemap-${index}`,
    title,
    url: entry.url,
    date,
    image: null,
    summary: `Publication détectée dans le sitemap de ${source.name}. Date issue de lastmod ; à vérifier sur la page source si nécessaire.`,
    tags,
    method: 'sitemap_fast'
  });
}

async function collectBySitemap(source, status) {
  if (!ENABLE_SITEMAP) return [];
  const siteUrl = sourceBaseUrl(source);
  const candidates = uniq([
    ...normalizeCandidates(source.sitemapCandidates, siteUrl),
    ...commonSitemapCandidates(siteUrl)
  ]).slice(0, MAX_SITEMAP_CANDIDATES);
  status.sitemapCandidatesTested = candidates.length;

  for (const sitemapUrl of candidates) {
    try {
      const entries = await parseSitemapUrls(sitemapUrl);
      const articles = entries
        .filter(entry => isLikelyArticleUrl(entry.url))
        .map((entry, index) => articleFromSitemapEntry(source, entry, index))
        .filter(Boolean)
        .slice(0, MAX_SITEMAP_URLS_PER_SOURCE);
      if (!articles.length) continue;
      status.method = 'sitemap_fast';
      status.status = 'ok';
      status.urlUsed = sitemapUrl;
      status.articleCount = articles.length;
      return articles;
    } catch (error) {
      status.lastSitemapError = error.message;
    }
  }
  return [];
}

function dedupeArticles(articles) {
  const out = [];
  const seen = new Set();
  for (const article of articles) {
    const key = article.url || article.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(article);
  }
  return out;
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

async function fetchSourceEntriesInternal(source) {
  const status = {
    sourceId: source.id,
    source: source.name,
    status: 'missing',
    method: 'none',
    urlUsed: null,
    articleCount: 0,
    rssCandidatesTested: 0,
    wpApiCandidatesTested: 0,
    sitemapCandidatesTested: 0
  };

  const collectors = [collectByRss, collectByWordPressApi, collectBySitemap];
  for (const collect of collectors) {
    const articles = await collect(source, status);
    if (articles.length) {
      feedStatus.push(status);
      if (VERBOSE) console.log(`${source.name}: ${articles.length} article(s) via ${status.method}`);
      return articles;
    }
  }
  feedStatus.push(status);
  if (VERBOSE) console.warn(`${source.name}: aucune publication exploitable`);
  return [];
}

async function fetchSourceEntries(source) {
  try {
    return await withTimeout(fetchSourceEntriesInternal(source), SOURCE_TIMEOUT_MS, `Timeout source ${source.name}`);
  } catch (error) {
    feedStatus.push({
      sourceId: source.id,
      source: source.name,
      status: 'timeout_or_error',
      method: 'none',
      urlUsed: null,
      articleCount: 0,
      error: error.message
    });
    return [];
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const [sources, manualEntries] = await Promise.all([
    readJson('sources.json'),
    readJson('manual_entries.json').catch(() => [])
  ]);

  const activeSources = sources.filter(source => source.active !== false && source.collectMode !== 'reference_only');
  const fetchedGroups = await mapWithConcurrency(activeSources, CONCURRENCY, source => fetchSourceEntries(source));
  const fetchedArticles = fetchedGroups.flat();

  const deduped = dedupeArticles([...manualEntries, ...fetchedArticles]);
  deduped.sort((a, b) => new Date(b.date) - new Date(a.date));

  const payload = {
    generatedAt: new Date().toISOString(),
    since: SINCE_DATE.toISOString().slice(0, 10),
    sources: activeSources.map(source => ({
      id: source.id,
      name: source.name,
      type: source.type,
      url: source.siteUrl,
      category: source.category || '',
      region: source.region || 'National',
      access: source.access || '',
      official: !!source.official,
      collectMode: source.collectMode || 'auto'
    })),
    articles: deduped
  };

  const statusPayload = {
    generatedAt: payload.generatedAt,
    since: payload.since,
    sourceCount: activeSources.length,
    ok: feedStatus.filter(x => x.status === 'ok').length,
    missing: feedStatus.filter(x => x.status !== 'ok').length,
    byMethod: {
      rss: feedStatus.filter(x => x.method === 'rss').length,
      wordpress_api: feedStatus.filter(x => x.method === 'wordpress_api').length,
      sitemap_fast: feedStatus.filter(x => x.method === 'sitemap_fast').length,
      none: feedStatus.filter(x => x.method === 'none').length
    },
    settings: {
      fetchTimeoutMs: FETCH_TIMEOUT_MS,
      sourceTimeoutMs: SOURCE_TIMEOUT_MS,
      concurrency: CONCURRENCY,
      maxRssCandidates: MAX_RSS_CANDIDATES,
      maxApiCandidates: MAX_API_CANDIDATES,
      maxSitemapCandidates: MAX_SITEMAP_CANDIDATES,
      listingPageScraping: false
    },
    details: feedStatus.sort((a, b) => a.source.localeCompare(b.source, 'fr'))
  };

  await fs.writeFile(path.join(ROOT, 'data.js'), `window.BATIVEILLE_DATA = ${JSON.stringify(payload, null, 2)};\n`, 'utf8');
  await fs.writeFile(path.join(ROOT, 'data.generated.json'), JSON.stringify(payload, null, 2), 'utf8');
  await fs.writeFile(path.join(ROOT, 'feed-status.json'), JSON.stringify(statusPayload, null, 2), 'utf8');

  console.log(`data.js mis à jour avec ${payload.articles.length} article(s) depuis le ${payload.since}.`);
  console.log(`Sources exploitables: ${statusPayload.ok}/${statusPayload.sourceCount}. Méthodes: RSS ${statusPayload.byMethod.rss}, WordPress API ${statusPayload.byMethod.wordpress_api}, sitemap rapide ${statusPayload.byMethod.sitemap_fast}, sans résultat ${statusPayload.byMethod.none}.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
