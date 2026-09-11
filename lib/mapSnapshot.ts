import { Directory, File, Paths } from 'expo-file-system';

/**
 * Cache for static map previews.
 *
 * A live MKMapView inside a scrolling list is the most expensive thing on a
 * screen; a picture of it costs nothing. react-native-maps renders the
 * picture (MKMapSnapshotter, with pins and route drawn in) and hands back a
 * plain file path under Documents. It is moved here, into the cache
 * directory, where iOS may purge it whenever it needs the space.
 */

function snapshotsDir(): Directory {
  const dir = new Directory(Paths.cache, 'map-snapshots');
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

/** djb2; only has to turn a long key into a short file name. */
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function fileFor(key: string): File {
  return new File(snapshotsDir(), `${hash(key)}.png`);
}

export function cachedMapSnapshot(key: string): string | null {
  try {
    const f = fileFor(key);
    return f.exists ? f.uri : null;
  } catch {
    return null;
  }
}

/** Move a freshly taken snapshot into the cache and return its uri. */
export function storeMapSnapshot(key: string, path: string): string {
  const src = new File(path.startsWith('file://') ? path : `file://${path}`);
  const dest = fileFor(key);
  if (dest.exists) dest.delete();
  src.move(dest);
  return dest.uri;
}
