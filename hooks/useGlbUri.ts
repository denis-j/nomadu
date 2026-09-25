import { useEffect, useState } from 'react';
import { Asset } from 'expo-asset';

/**
 * Resolves a `require(...)`'d GLB module to a concrete local `file://` URI.
 *
 * In dev, react-native-filament can load the metro http URL directly, but in a
 * production build there is no metro server, the bundled asset has to be
 * resolved to its on-device file path. expo-asset's downloadAsync() unpacks the
 * embedded asset and gives us `localUri`, which Filament's loader accepts via
 * its `file://` branch.
 */
export function useGlbUri(moduleId: number): string | null {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const asset = Asset.fromModule(moduleId);
    asset
      .downloadAsync()
      .then(() => {
        if (cancelled) return;
        const resolved = asset.localUri ?? asset.uri;
        // expo-asset returns a percent-encoded URI (e.g. "Application%20Support").
        // react-native-filament's native loader does NOT percent-decode the path
        // before NSData reads it, so "%20" is treated literally and the file is not
        // found in release builds. Decode it back to real spaces here.
        setUri(decodeURI(resolved));
      })
      .catch((e) => {
        console.error('Failed to resolve GLB asset', e);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  return uri;
}
