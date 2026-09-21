import { useEffect, useState } from 'react';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * A face for every traveller, without asking anyone for a photo.
 *
 * DiceBear draws a cartoon avatar from a seed, deterministically: the same
 * seed is the same face on every phone. The seed is the traveller's account
 * id, or the traveller row's sync id for a name typed into the wallet, so
 * the owner and every friend see the same person the same way and nothing
 * about the person is sent, only an opaque id.
 *
 * Each picture is fetched once and kept in the cache directory. Offline
 * with nothing cached, the disc shows initials instead; the picture fills
 * in the next time it can. The style is one constant: `avataaars` is free
 * for commercial use without attribution, most other DiceBear styles are
 * CC BY and would need a line in the settings.
 */

const STYLE = 'avataaars';
const PIXELS = 192;
const BASE = `https://api.dicebear.com/9.x/${STYLE}/png`;

function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, 'avatars');
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

/** A file name the seed cannot break out of. */
function fileFor(seed: string): File {
  const safe = seed.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  return new File(cacheDir(), `${STYLE}-${safe}.png`);
}

const inFlight = new Map<string, Promise<string | null>>();
const known = new Map<string, string | null>();

/** The local uri of the seed's face, downloading it first if needed; null when that fails. */
export async function avatarUri(seed: string): Promise<string | null> {
  const hit = known.get(seed);
  if (hit !== undefined) return hit;
  let pending = inFlight.get(seed);
  if (!pending) {
    pending = (async () => {
      try {
        const file = fileFor(seed);
        if (!file.exists) {
          await File.downloadFileAsync(`${BASE}?seed=${encodeURIComponent(seed)}&size=${PIXELS}`, file);
        }
        known.set(seed, file.uri);
        return file.uri;
      } catch {
        // Offline, or the service is down: initials do for now and the
        // next call tries again.
        return null;
      } finally {
        inFlight.delete(seed);
      }
    })();
    inFlight.set(seed, pending);
  }
  return pending;
}

/** The face for a seed, once it is on disk. */
export function useAvatar(seed: string | null): string | null {
  const [uri, setUri] = useState<string | null>(() => (seed ? known.get(seed) ?? null : null));
  useEffect(() => {
    if (!seed) return;
    let live = true;
    avatarUri(seed).then((u) => { if (live) setUri(u); });
    return () => { live = false; };
  }, [seed]);
  return uri;
}
