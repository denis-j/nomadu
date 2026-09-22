/**
 * The seed a traveller's cartoon face is drawn from (see lib/avatars.ts).
 *
 * Never the account id itself: the seed is sent to the avatar service and,
 * for an invite, printed into a public web page. A short one-way hash keeps
 * the face stable and identical on every phone and on the invite page,
 * without putting an account id anywhere it does not belong. FNV-1a, not a
 * crypto hash, because both the app and the Functions have to compute it
 * synchronously and the only thing at stake is which cartoon comes back.
 */
export function avatarSeed(id: string | null | undefined): string {
  if (!id) return 'unknown';
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < id.length; i++) {
    hash ^= BigInt(id.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}
