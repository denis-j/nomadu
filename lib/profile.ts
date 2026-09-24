import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { avatarSvg, avatarUri } from './avatars';

/**
 * The name and face someone picked for themselves.
 *
 * Chosen in onboarding, before there is an account, so it is stored under the
 * same placeholder uid as the other onboarding answers and moved onto the
 * real uid after sign-up (see migrateLocalOnboardingData). The face is a
 * DiceBear seed (lib/avatars.ts): a short random string, nothing about the
 * person. Pushed to `users/{uid}` with the rest of the profile, so friends on
 * a shared trip see the same face.
 */

export interface Profile {
  name: string;
  /** DiceBear seed of the chosen face; null for the default drawn from the account id. */
  avatar: string | null;
}

export const PROFILE_NAME_KEY = (uid: string) => `@profile_name_${uid}`;
export const PROFILE_AVATAR_KEY = (uid: string) => `@profile_avatar_${uid}`;

/** A fresh face to suggest: random, so every tap on the dice shows another one. */
export function randomAvatarSeed(): string {
  return Crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

const SUGGESTIONS_KEY = '@avatar_suggestions';
const SUGGESTION_COUNT = 5;
let suggestions: string[] | null = null;

/**
 * The faces offered next to your own in the profile editor. The same few
 * every time, kept on disk with their pictures, so the editor opens with
 * them already drawn instead of fetching new ones on each visit.
 */
export function suggestedFaces(): string[] {
  if (!suggestions) {
    suggestions = Array.from({ length: SUGGESTION_COUNT }, randomAvatarSeed);
    AsyncStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(suggestions)).catch(() => {});
  }
  return suggestions;
}

/** Read the saved suggestions and fetch their pictures ahead, at start-up and before onboarding needs them. */
export async function prefetchSuggestedFaces(): Promise<void> {
  if (!suggestions) {
    try {
      const saved = JSON.parse((await AsyncStorage.getItem(SUGGESTIONS_KEY)) ?? 'null');
      if (!suggestions && Array.isArray(saved) && saved.length === SUGGESTION_COUNT && saved.every((x) => typeof x === 'string')) {
        suggestions = saved;
      }
    } catch {
      // Unreadable: suggestedFaces draws new ones.
    }
  }
  await Promise.all(suggestedFaces().flatMap((seed) => [avatarUri(seed), avatarSvg(seed)]));
}

let current: { uid: string; profile: Profile } | null = null;
const listeners = new Set<(p: Profile) => void>();

export async function getProfile(uid: string): Promise<Profile> {
  if (current?.uid === uid) return current.profile;
  const [[, name], [, avatar]] = await AsyncStorage.multiGet([PROFILE_NAME_KEY(uid), PROFILE_AVATAR_KEY(uid)]);
  const profile = { name: name ?? '', avatar: avatar || null };
  current = { uid, profile };
  return profile;
}

export async function setProfile(uid: string, profile: Profile): Promise<void> {
  const name = profile.name.trim().slice(0, 40);
  await AsyncStorage.setItem(PROFILE_NAME_KEY(uid), name);
  if (profile.avatar) await AsyncStorage.setItem(PROFILE_AVATAR_KEY(uid), profile.avatar);
  else await AsyncStorage.removeItem(PROFILE_AVATAR_KEY(uid));
  current = { uid, profile: { name, avatar: profile.avatar } };
  listeners.forEach((l) => l(current!.profile));
}

/**
 * The signed-in user's face seed, synchronously, for the avatar rows that
 * are built without waiting (TravellerAvatars). Null until the profile was
 * read once or when none was chosen.
 */
export function myAvatarSeed(uid: string | null): string | null {
  return uid && current?.uid === uid ? current.profile.avatar : null;
}

/** The profile of `uid`, kept current when it changes anywhere in the app. */
export function useProfile(uid: string | null): Profile | null {
  const [profile, setState] = useState<Profile | null>(() => (uid && current?.uid === uid ? current.profile : null));
  useEffect(() => {
    if (!uid) return;
    let live = true;
    getProfile(uid).then((p) => { if (live) setState(p); });
    const listener = (p: Profile) => { if (live && current?.uid === uid) setState(p); };
    listeners.add(listener);
    return () => { live = false; listeners.delete(listener); };
  }, [uid]);
  return profile;
}

/** Forget the cached profile, for when another account signs in. */
export function resetProfileCache(): void {
  current = null;
}
