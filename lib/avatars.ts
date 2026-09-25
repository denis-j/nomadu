import { useEffect, useState } from 'react';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * A face for every traveller, without asking anyone for a photo.
 *
 * DiceBear draws a cartoon avatar from a seed, deterministically: the same
 * seed is the same face on every phone. The seed is the face someone picked
 * (lib/profile.ts), or else drawn from their account id or the traveller
 * row's sync id, so the owner and every friend see the same person the same
 * way and nothing about the person is sent, only an opaque id.
 *
 * Style `thumbs`, DiceBear's own design under CC0: free for commercial use
 * without attribution. Colours are the app's own, cloud-white faces on its
 * sky blues with navy features, instead of the style's random palette.
 *
 * Two forms of each face, both fetched once and kept in the cache directory:
 *
 *   - PNG, 384 px, sharp at the largest size the app draws: for the small
 *     discs in lists, where many sit side by side.
 *   - SVG with DiceBear's own CSS animation (a blink, a sway): for the few
 *     places a face is on its own, drawn by AnimatedFace in a web view,
 *     because React Native does not run CSS animations.
 *
 * Offline with nothing cached, the disc shows initials instead; the picture
 * fills in the next time it can. The public invite page draws the same face
 * (functions/src/share.ts), so both must use the same parameters.
 */

export const AVATAR_STYLE = 'thumbs';
const API = `https://api.dicebear.com/10.x/${AVATAR_STYLE}`;
/** Keep in step with AVATAR_PARAMS in functions/src/share.ts. */
export const AVATAR_PARAMS =
  'backgroundColor=4dc1ff,8ad3ff,2fa8e8&shapeColor=ffffff,f2faff&eyesColor=0b2541&mouthColor=0b2541';
const PIXELS = 384;
/** Part of the cache file name: a change of style or colours fetches afresh. */
const VERSION = 'thumbs10c';

function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, 'avatars');
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

/** A file name the seed cannot break out of. */
function fileFor(seed: string, ext: 'png' | 'svg'): File {
  const safe = seed.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  return new File(cacheDir(), `${VERSION}-${safe}.${ext}`);
}

function urlFor(seed: string, ext: 'png' | 'svg'): string {
  const s = encodeURIComponent(seed);
  return ext === 'png'
    ? `${API}/png?seed=${s}&size=${PIXELS}&${AVATAR_PARAMS}`
    : `${API}/svg?seed=${s}&animationVariant=medium&${AVATAR_PARAMS}`;
}

const inFlight = new Map<string, Promise<string | null>>();
const known = new Map<string, string | null>();

/**
 * Fetch-once with a shared in-flight promise per key. `read` turns the file
 * on disk into what callers get: its uri for the PNG, its text for the SVG.
 */
function cached(seed: string, ext: 'png' | 'svg', read: (file: File) => Promise<string>): Promise<string | null> {
  const key = `${ext}:${seed}`;
  const hit = known.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const file = fileFor(seed, ext);
        if (!file.exists) await File.downloadFileAsync(urlFor(seed, ext), file);
        const value = await read(file);
        known.set(key, value);
        return value;
      } catch {
        // Offline, or the service is down: initials do for now and the
        // next call tries again.
        return null;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, pending);
  }
  return pending;
}

/** The local uri of the seed's still face, downloading it first if needed; null when that fails. */
export function avatarUri(seed: string): Promise<string | null> {
  return cached(seed, 'png', async (file) => file.uri);
}

/** The seed's animated face as SVG markup; null when it cannot be had. */
export function avatarSvg(seed: string): Promise<string | null> {
  return cached(seed, 'svg', (file) => file.text());
}

/**
 * What is known without waiting: an earlier answer, or for the still face a
 * file already on disk (checking is synchronous). Without this every face
 * showed its initials for a frame after each mount and then swapped to the
 * picture, a flicker in every header and list.
 */
function knownNow(seed: string | null, ext: 'png' | 'svg'): string | null {
  if (!seed) return null;
  const hit = known.get(`${ext}:${seed}`);
  if (hit !== undefined) return hit;
  if (ext !== 'png') return null;
  try {
    const file = fileFor(seed, 'png');
    if (!file.exists) return null;
    known.set(`png:${seed}`, file.uri);
    return file.uri;
  } catch {
    return null;
  }
}

function useCached(seed: string | null, ext: 'png' | 'svg', load: (seed: string) => Promise<string | null>): string | null {
  const [value, setValue] = useState<string | null>(() => knownNow(seed, ext));
  useEffect(() => {
    if (!seed) return;
    let live = true;
    setValue(knownNow(seed, ext));
    load(seed).then((v) => { if (live) setValue(v); });
    return () => { live = false; };
  }, [seed, ext, load]);
  return value;
}

/** The still face for a seed, once it is on disk. */
export function useAvatar(seed: string | null): string | null {
  return useCached(seed, 'png', avatarUri);
}

/** The animated face for a seed, once it is on disk. */
export function useAvatarSvg(seed: string | null): string | null {
  return useCached(seed, 'svg', avatarSvg);
}
