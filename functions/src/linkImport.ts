/**
 * A shared link (a TikTok, a Reel, a YouTube video, a blog post) turned
 * into activities for the trip.
 *
 * The post is read the way a link preview reads it: TikTok and YouTube
 * through their public oEmbed endpoints, everything else (Instagram
 * included) by fetching the page and reading its Open Graph tags. Only the
 * text and the thumbnail are used; no video is ever downloaded. Gemini then
 * picks out the concrete places and sorts them into the trip's stops.
 *
 * Fetching a URL a user typed is how a server gets tricked into calling
 * its own metadata service or something on the internal network, so every
 * request here goes through `fetchSafe`: https only, no IP literals or
 * internal host names, every address the name resolves to must be public
 * (checked on the connection itself, so a second DNS answer cannot swap in
 * a private one), at most a few redirects, each checked the same way, a
 * short timeout and a size cap. The checks are small pure functions so the
 * tests can hold them to it.
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { IncomingMessage } from 'node:http';
import type { Readable } from 'node:stream';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

import { firstUrl, sourceOfUrl, type ActivityCategory, type ActivitySource } from '../../lib/activityModel';
import { requireAppAccess, revenueCatKey } from './access';
import { extractJsonArray, generateFromImage, generateText, geminiKey } from './gemini';
import { buildLinkImportPrompt, coerceCategory, modelText, sanitize, type LinkImportStop } from './prompts';
import { consumeQuota } from './rateLimit';

const TIMEOUT_MS = 8_000;
const MAX_HOPS = 5;
const MAX_HTML_BYTES = 1_500_000;
const MAX_JSON_BYTES = 256_000;
const MAX_IMAGE_BYTES = 5_000_000;
const MAX_CAPTION = 4000;
const MAX_STOPS = 80;
const MAX_ACTIVITIES = 10;
/** What link previews send; Instagram and most sites answer it with their Open Graph tags. */
const USER_AGENT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
/** Kinds of picture Gemini reads. */
const GEMINI_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** A link we will not open, or a page that could not be read. The message is for logs. */
export class LinkError extends Error {}

// ─── Which hosts and addresses are off limits ────────────────────────────────

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255) ? parts : null;
}

/**
 * Private, loopback, link-local (the metadata service lives at
 * 169.254.169.254), carrier-grade NAT, documentation, benchmarking,
 * multicast and reserved IPv4 ranges. Anything that does not parse counts
 * as blocked.
 */
export function isBlockedIPv4(ip: string): boolean {
  const p = ipv4Parts(ip);
  if (!p) return true;
  const [a, b, c] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** An IPv6 address as eight 16-bit groups, or null when it is not one. */
export function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  // A trailing dotted quad (::ffff:10.0.0.1) is the last two groups.
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const p = ipv4Parts(v4[1]);
    if (!p) return null;
    s = s.slice(0, -v4[1].length) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/**
 * Loopback, unspecified, unique-local, link-local, site-local, multicast
 * and documentation IPv6 ranges, and any IPv4 address smuggled inside one
 * (mapped, compatible, NAT64), judged as that IPv4 address.
 */
export function isBlockedIPv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return true;
  const embedded = () => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  const zeros = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeros(5) && g[5] === 0xffff) return isBlockedIPv4(embedded());
  if (zeros(6)) return true; // ::, ::1 and the old IPv4-compatible form
  if (g[0] === 0x64 && g[1] === 0xff9b) return isBlockedIPv4(embedded());
  return (
    (g[0] & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (g[0] & 0xffc0) === 0xfe80 || // fe80::/10 link local
    (g[0] & 0xffc0) === 0xfec0 || // fec0::/10 site local
    (g[0] & 0xff00) === 0xff00 || // multicast
    (g[0] === 0x2001 && g[1] === 0x0db8) || // documentation
    (g[0] === 0x2001 && g[1] < 0x0200) || // IETF special-purpose blocks, Teredo among them
    g[0] === 0x2002 // 6to4, which wraps an IPv4 address we cannot vouch for
  );
}

export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedIPv4(ip);
  if (kind === 6) return isBlockedIPv6(ip);
  return true;
}

/**
 * Names that point inside: localhost, the metadata service, internal and
 * local zones, and single-label names a resolver might complete with a
 * search domain. IP literals are refused outright: a post lives on a name.
 */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || isIP(host) !== 0) return true;
  if (!host.includes('.')) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === 'metadata.google.internal') return true;
  return /\.(internal|local|localdomain|lan|home|corp|intranet|arpa)$/.test(host);
}

/** A URL we may fetch: https, on the default port, no credentials, a public-looking name. */
export function checkUrl(raw: string): URL {
  if (raw.length > 2048) throw new LinkError('url too long');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LinkError('not a url');
  }
  if (url.protocol !== 'https:') throw new LinkError('not https');
  if (url.username || url.password) throw new LinkError('credentials in url');
  if (url.port && url.port !== '443') throw new LinkError('unusual port');
  if (isBlockedHostname(url.hostname)) throw new LinkError('blocked host');
  return url;
}

/**
 * Resolve a name and refuse it when any of its addresses is not public.
 * Used as the connection's own lookup, so the address that was checked is
 * the address that is dialled.
 */
type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;
const resolveAll: Resolver = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

export async function publicAddresses(hostname: string, resolve: Resolver = resolveAll): Promise<{ address: string; family: number }[]> {
  if (isBlockedHostname(hostname)) throw new LinkError('blocked host');
  const found = await resolve(hostname);
  if (!found.length) throw new LinkError('no address');
  if (found.some((a) => isBlockedAddress(a.address))) throw new LinkError('private address');
  return found;
}

const safeLookup: LookupFunction = (hostname, options, callback) => {
  publicAddresses(hostname).then(
    (found) => {
      const wanted = options.family === 4 || options.family === 6 ? found.filter((a) => a.family === options.family) : found;
      if (!wanted.length) return (callback as any)(new LinkError('no address of that family'), '', 0);
      if (options.all) return (callback as any)(null, wanted);
      return callback(null, wanted[0].address, wanted[0].family);
    },
    (err) => (callback as any)(err, '', 0),
  );
};

// ─── Fetching ────────────────────────────────────────────────────────────────

interface Fetched {
  /** Where the last redirect ended. */
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
}

interface FetchOptions {
  maxBytes: number;
  /** Keep the first maxBytes of a longer body (an HTML head is all we need) instead of failing. */
  truncate?: boolean;
  accept?: string;
}

function decoded(res: IncomingMessage): Readable {
  const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
  if (encoding === 'gzip' || encoding === 'x-gzip') return res.pipe(createGunzip());
  if (encoding === 'deflate') return res.pipe(createInflate());
  if (encoding === 'br') return res.pipe(createBrotliDecompress());
  return res;
}

function fetchOnce(url: URL, options: FetchOptions, deadline: number): Promise<{ res: IncomingMessage; body: Buffer | null }> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new LinkError('timeout'));
    const req = httpsRequest(url.toString(), {
      method: 'GET',
      lookup: safeLookup,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: options.accept ?? '*/*',
        'Accept-Language': 'en',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
    const timer = setTimeout(() => req.destroy(new LinkError('timeout')), remaining);
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.on('response', (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        clearTimeout(timer);
        res.resume();
        req.destroy();
        return resolve({ res, body: null });
      }
      const declared = Number(res.headers['content-length'] ?? 0);
      if (!options.truncate && declared > options.maxBytes) {
        clearTimeout(timer);
        req.destroy();
        return reject(new LinkError('too large'));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      let done = false;
      const finish = (err?: Error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) return reject(err);
        resolve({ res, body: Buffer.concat(chunks) });
      };
      const stream = decoded(res);
      stream.on('data', (chunk: Buffer) => {
        if (done) return;
        if (size + chunk.length > options.maxBytes) {
          if (!options.truncate) {
            req.destroy();
            return finish(new LinkError('too large'));
          }
          chunks.push(chunk.subarray(0, options.maxBytes - size));
          size = options.maxBytes;
          req.destroy();
          return finish();
        }
        chunks.push(chunk);
        size += chunk.length;
      });
      stream.on('end', () => finish());
      stream.on('error', (err) => finish(err));
    });
    req.end();
  });
}

/**
 * GET with every safety check, following redirects by hand so each hop is
 * checked as if it were the first. One deadline for the whole chain.
 */
export async function fetchSafe(raw: string, options: FetchOptions): Promise<Fetched> {
  const deadline = Date.now() + TIMEOUT_MS;
  let url = checkUrl(raw);
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const { res, body } = await fetchOnce(url, options, deadline);
    if (body === null) {
      url = checkUrl(new URL(String(res.headers.location), url).toString());
      continue;
    }
    return { url: url.toString(), status: res.statusCode ?? 0, contentType: String(res.headers['content-type'] ?? '').toLowerCase(), body };
  }
  throw new LinkError('too many redirects');
}

// ─── Reading a post ──────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith('#x') || lower.startsWith('#')) {
      const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[lower] ?? whole;
  });
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return out;
}

export interface PageMeta {
  title: string | null;
  description: string | null;
  image: string | null;
}

const clean = (value: string | undefined | null, max: number): string | null => {
  if (!value) return null;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return text || null;
};

/** Only an https picture is worth keeping: the app loads it as it is. */
export function httpsImage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (url.length > 2000 || !/^https:\/\/\S+$/i.test(url)) return null;
  return url;
}

/**
 * The Open Graph tags of a page (with Twitter and plain `<meta
 * name=description>` and `<title>` as fallbacks). A regex over the meta
 * tags is enough: we want three values, not a DOM.
 */
export function parseOpenGraph(html: string): PageMeta {
  const meta: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(m[0]);
    const key = (a.property ?? a.name ?? '').toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
  }
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    title: clean(meta['og:title'] ?? meta['twitter:title'] ?? (titleTag ? decodeEntities(titleTag) : null), 300),
    description: clean(meta['og:description'] ?? meta['twitter:description'] ?? meta.description, MAX_CAPTION),
    image: httpsImage(meta['og:image:secure_url'] ?? meta['og:image'] ?? meta['twitter:image']),
  };
}

export interface OEmbed {
  title: string | null;
  author: string | null;
  thumbnail: string | null;
}

/** The three fields of an oEmbed answer we use. TikTok puts the whole caption in `title`. */
export function parseOEmbed(json: unknown): OEmbed {
  const x = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  return {
    title: clean(typeof x.title === 'string' ? x.title : null, MAX_CAPTION),
    author: clean(typeof x.author_name === 'string' ? x.author_name : null, 100),
    thumbnail: httpsImage(x.thumbnail_url),
  };
}

/**
 * The post's address without the share-sheet noise (`?igsh=`, `?_r=`,
 * `utm_*`), so the same reel shared twice is the same link. A YouTube
 * watch link keeps its `v`.
 */
export function canonicalPostUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  url.hash = '';
  const source = sourceOfUrl(raw);
  if (source === 'youtube') {
    const v = url.searchParams.get('v');
    url.search = '';
    if (v) url.searchParams.set('v', v);
  } else if (source === 'tiktok' || source === 'instagram') {
    url.search = '';
  } else {
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|igsh$|si$|ref$)/i.test(key)) url.searchParams.delete(key);
    }
  }
  return url.toString();
}

/** vm.tiktok.com/abc and tiktok.com/t/abc only redirect to the real video. */
export function isShortTikTok(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host === 'vm.tiktok.com' || host === 'vt.tiktok.com' || (host.endsWith('tiktok.com') && url.pathname.startsWith('/t/'));
}

interface Post {
  source: ActivitySource;
  url: string;
  title: string | null;
  author: string | null;
  caption: string | null;
  image: string | null;
}

async function oEmbed(endpoint: string): Promise<OEmbed | null> {
  try {
    const res = await fetchSafe(endpoint, { maxBytes: MAX_JSON_BYTES, accept: 'application/json' });
    if (res.status !== 200) return null;
    return parseOEmbed(JSON.parse(res.body.toString('utf8')));
  } catch (err) {
    logger.warn('link import: oEmbed failed', { endpoint: endpoint.slice(0, 120), err: String(err) });
    return null;
  }
}

async function pageMeta(url: string): Promise<{ url: string; meta: PageMeta } | null> {
  try {
    const res = await fetchSafe(url, { maxBytes: MAX_HTML_BYTES, truncate: true, accept: 'text/html,application/xhtml+xml' });
    if (res.status !== 200 || !/html/.test(res.contentType)) return null;
    return { url: res.url, meta: parseOpenGraph(res.body.toString('utf8')) };
  } catch (err) {
    logger.warn('link import: page failed', { host: new URL(url).hostname, err: String(err) });
    return null;
  }
}

/** Everything we can learn about a post without watching it. */
async function readPost(start: URL): Promise<Post> {
  let url = start.toString();
  const source = sourceOfUrl(url);
  if (source === 'tiktok' && isShortTikTok(start)) {
    try {
      url = (await fetchSafe(url, { maxBytes: 64_000, truncate: true, accept: 'text/html' })).url;
    } catch (err) {
      logger.warn('link import: short link did not resolve', { err: String(err) });
    }
  }
  const post: Post = { source, url, title: null, author: null, caption: null, image: null };

  if (source === 'tiktok' || source === 'youtube') {
    const endpoint = source === 'tiktok'
      ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
      : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    const o = await oEmbed(endpoint);
    if (o) {
      post.author = o.author;
      post.image = o.thumbnail;
      if (source === 'tiktok') post.caption = o.title;
      else post.title = o.title;
    }
  }

  // The page itself: the only way into Instagram and blogs, the
  // description of a YouTube video, and the fallback when oEmbed failed.
  if (!post.caption) {
    const page = await pageMeta(url);
    if (page) {
      post.url = page.url;
      // A shortener or a blog's own link can end on a known platform.
      if (post.source === 'link') post.source = sourceOfUrl(page.url);
      post.title = post.title ?? page.meta.title;
      post.caption = page.meta.description;
      post.image = post.image ?? page.meta.image;
    }
  }
  return post;
}

async function thumbnail(url: string | null): Promise<{ base64: string; mimeType: string } | null> {
  if (!url) return null;
  try {
    const res = await fetchSafe(url, { maxBytes: MAX_IMAGE_BYTES, accept: 'image/*' });
    const mimeType = res.contentType.split(';')[0].trim();
    if (res.status !== 200 || !mimeType.startsWith('image/') || !GEMINI_IMAGE_TYPES.includes(mimeType)) return null;
    return { base64: res.body.toString('base64'), mimeType };
  } catch (err) {
    logger.warn('link import: thumbnail failed', { err: String(err) });
    return null;
  }
}

// ─── What the model found ────────────────────────────────────────────────────

export interface ImportedActivity {
  title: string;
  category: ActivityCategory;
  place: string | null;
  address: string | null;
  stop_id: string | null;
  notes: string | null;
}

/** The model's list, checked: known keys, capped strings, a stop id only when it is one of ours, ten at most. */
export function coerceImportedActivities(parsed: unknown[], stopIds: string[]): ImportedActivity[] {
  const out: ImportedActivity[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const x = raw as Record<string, unknown>;
    const title = modelText(x.title, 120);
    if (!title) continue;
    out.push({
      title,
      category: coerceCategory(x.category),
      place: modelText(x.place, 120),
      address: modelText(x.address, 200),
      stop_id: typeof x.stop_id === 'string' && stopIds.includes(x.stop_id) ? x.stop_id : null,
      notes: modelText(x.notes, 1000),
    });
    if (out.length === MAX_ACTIVITIES) break;
  }
  return out;
}

// ─── The callable ────────────────────────────────────────────────────────────

/** The link as pasted or shared: the first URL in the text, upgraded to https. */
export function linkFrom(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim()) throw new HttpsError('invalid-argument', '"url" is required.');
  const found = (firstUrl(value) ?? value.trim()).replace(/^http:\/\//i, 'https://');
  try {
    return checkUrl(found);
  } catch {
    throw new HttpsError('invalid-argument', 'That is not a link we can open.');
  }
}

export function stopsFrom(value: unknown): LinkImportStop[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_STOPS) throw new HttpsError('invalid-argument', `"stops" must be a list of at most ${MAX_STOPS}.`);
  return value
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as any).id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test((s as any).id))
    .map((s) => ({
      id: String(s.id),
      city: sanitize(String(s.city ?? ''), 80),
      country: sanitize(String(s.country ?? ''), 80),
      start_date: sanitize(String(s.start_date ?? ''), 10),
      end_date: sanitize(String(s.end_date ?? ''), 10),
    }));
}

export const importActivityLink = onCall(
  { region: 'us-central1', secrets: [geminiKey, revenueCatKey], memory: '512MiB', timeoutSeconds: 120 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in to use this feature.');
    const link = linkFrom(request.data?.url);
    const stops = stopsFrom(request.data?.stops);

    await requireAppAccess(request, uid, 'importActivityLink');
    await consumeQuota(uid, 'importActivityLink');

    const post = await readPost(link);
    const image = await thumbnail(post.image);
    const caption = post.caption ?? post.title;
    if (!caption && !image) {
      throw new HttpsError('failed-precondition', 'Could not read that post. Paste the caption or add it by hand.');
    }

    const sourceUrl = canonicalPostUrl(post.url);
    const prompt = buildLinkImportPrompt(
      { source: post.source, url: sourceUrl, title: post.title, author: post.author, caption: post.caption },
      stops,
      !!image,
    );
    const raw = image
      ? await generateFromImage(geminiKey.value(), prompt, image.base64, image.mimeType)
      : await generateText(geminiKey.value(), prompt, 2048, 0.2);
    const parsed = extractJsonArray(raw);
    if (!parsed) logger.warn('importActivityLink: no JSON array in response', { preview: raw.slice(0, 300) });

    return {
      source: post.source,
      source_url: sourceUrl,
      image_url: post.image,
      author: post.author,
      caption: caption ? caption.slice(0, MAX_CAPTION) : null,
      activities: coerceImportedActivities(parsed ?? [], stops.map((s) => s.id)),
    };
  },
);
