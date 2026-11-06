/**
 * Things to do on a trip: the shape of the data and the rules it must obey.
 *
 * An activity belongs to one stop of a journey, or to the journey alone
 * while it waits to be placed (a link shared in before it was clear where
 * it goes). Many per stop, each its own record, so two people adding ideas
 * to the same city never write over each other. Planning only: nothing
 * here touches the timeline, visas or taxes.
 *
 * Pure, like lib/accommodationModel.ts, whose checks it reuses: the app
 * uses it for its forms, the Functions (agent API, link import, friends who
 * plan along) are bundled with it, so what one side accepts the other does.
 */

import { invalid, pickAmount, pickCurrency, pickText, pickUrl } from './accommodationModel';

/**
 * Whether the app shows activities. The data already syncs (the agent can
 * write them, friends get them), but the screens wait for their redesign.
 */
export const ACTIVITIES_UI = true;

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export const ACTIVITY_STATUSES = ['idea', 'planned', 'booked', 'done'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  idea: 'Idea',
  planned: 'Planned',
  booked: 'Booked',
  done: 'Done',
};

export const ACTIVITY_CATEGORIES = [
  'food',
  'cafe',
  'nightlife',
  'sight',
  'culture',
  'nature',
  'beach',
  'tour',
  'sport',
  'wellness',
  'shopping',
  'other',
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  food: 'Food',
  cafe: 'Café',
  nightlife: 'Nightlife',
  sight: 'Sightseeing',
  culture: 'Culture',
  nature: 'Nature',
  beach: 'Beach',
  tour: 'Tour',
  sport: 'Sport',
  wellness: 'Wellness',
  shopping: 'Shopping',
  other: 'Other',
};

/** Ionicons per category, for the list and the chips. */
export const ACTIVITY_CATEGORY_ICONS: Record<ActivityCategory, string> = {
  food: 'restaurant-outline',
  cafe: 'cafe-outline',
  nightlife: 'wine-outline',
  sight: 'camera-outline',
  culture: 'color-palette-outline',
  nature: 'leaf-outline',
  beach: 'sunny-outline',
  tour: 'walk-outline',
  sport: 'bicycle-outline',
  wellness: 'flower-outline',
  shopping: 'bag-handle-outline',
  other: 'sparkles-outline',
};

/** Where an activity came from: typed in, the user's agent, an AI suggestion, or a shared link. */
export const ACTIVITY_SOURCES = ['manual', 'agent', 'ai', 'tiktok', 'instagram', 'youtube', 'link'] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export interface Activity {
  /** Its own id (UUID); the cloud document id too. */
  id: string;
  journey_id: string;
  /** The stop's sync id; null while it waits to be placed. */
  stop_id: string | null;
  title: string;
  category: ActivityCategory;
  status: ActivityStatus;
  /** The place by name ("Bánh Mì Phượng"), and where it is. */
  place: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** A page about it: the venue, a booking, a map link. */
  url: string | null;
  price: number | null;
  currency: string | null;
  notes: string | null;
  source: ActivitySource;
  /** The post it came from (TikTok, Instagram, …), when it came from one. */
  source_url: string | null;
  /** A preview picture, from that post or the page. */
  image_url: string | null;
  sort_order: number;
  updated_at: string;
  deleted: boolean;
}

/** At most this many per journey, so a runaway agent cannot fill a trip. */
export const MAX_ACTIVITIES_PER_JOURNEY = 300;

// ─── Checks ──────────────────────────────────────────────────────────────────

function asObject(input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) return invalid('activity', 'An activity must be an object.');
  return input as Record<string, unknown>;
}

function pickChoice<T extends string>(value: unknown, fallback: T, field: string, choices: readonly T[]): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !(choices as readonly string[]).includes(value)) {
    return invalid(field, `${field} must be one of ${choices.join(', ')}.`);
  }
  return value as T;
}

function pickCoordinate(value: unknown, fallback: number | null, field: string, limit: number): number | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) {
    return invalid(field, `${field} must be a number between -${limit} and ${limit}.`);
  }
  return value;
}

/** The editable fields of an activity. */
export type ActivityFields = Omit<Activity, 'id' | 'journey_id' | 'stop_id' | 'sort_order' | 'updated_at' | 'deleted'>;

/**
 * An activity as given, on top of what was there. A new one needs a title;
 * everything else is optional but checked when present. A field that is
 * absent keeps its value, `null` clears it. A price needs a currency.
 */
export function normalizeActivity(input: unknown, existing: ActivityFields | null = null): ActivityFields {
  const x = asObject(input);
  const title = pickText(x.title, existing?.title ?? null, 'title', 120);
  if (!title) invalid('title', 'An activity needs a title.');
  const out: ActivityFields = {
    title: title!,
    category: pickChoice(x.category, existing?.category ?? 'other', 'category', ACTIVITY_CATEGORIES),
    status: pickChoice(x.status, existing?.status ?? 'idea', 'status', ACTIVITY_STATUSES),
    place: pickText(x.place, existing?.place ?? null, 'place', 120),
    address: pickText(x.address, existing?.address ?? null, 'address', 200),
    latitude: pickCoordinate(x.latitude, existing?.latitude ?? null, 'latitude', 90),
    longitude: pickCoordinate(x.longitude, existing?.longitude ?? null, 'longitude', 180),
    url: pickUrl(x.url, existing?.url ?? null, 'url'),
    price: pickAmount(x.price, existing?.price ?? null, 'price'),
    currency: pickCurrency(x.currency, existing?.currency ?? null, 'currency'),
    notes: pickText(x.notes, existing?.notes ?? null, 'notes', 1000),
    source: pickChoice(x.source, existing?.source ?? 'manual', 'source', ACTIVITY_SOURCES),
    source_url: pickUrl(x.source_url, existing?.source_url ?? null, 'source_url'),
    image_url: pickUrl(x.image_url, existing?.image_url ?? null, 'image_url'),
  };
  if (out.price !== null && !out.currency) invalid('currency', 'A price needs a currency (ISO 4217, like "THB").');
  return out;
}

/**
 * Activities in the order they are shown: by stop as the caller groups
 * them, then planned before ideas, then by their own order.
 */
const STATUS_ORDER: Record<ActivityStatus, number> = { booked: 0, planned: 1, idea: 2, done: 3 };

export function sortActivities<T extends Pick<Activity, 'status' | 'sort_order' | 'title'>>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.sort_order - b.sort_order || a.title.localeCompare(b.title));
}

/** "3 things to do" on a stop's card; null when there are none. */
export function activitiesChipText(list: Pick<Activity, 'status' | 'deleted'>[]): string | null {
  const live = list.filter((a) => !a.deleted);
  if (live.length === 0) return null;
  return live.length === 1 ? '1 thing to do' : `${live.length} things to do`;
}

/** Which platform a shared link is from, for the source and the import. */
export function sourceOfUrl(url: string): ActivitySource {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'link';
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'youtube';
  return 'link';
}

/** The first http(s) link in a piece of text, as a share sheet or the clipboard hands it over. */
export function firstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[).,!?]+$/, '') : null;
}
