/**
 * Accommodation planning: the shape of the data and the rules it must obey.
 *
 * One plan per planned stop. It says whether a place is needed, what it
 * should be like, which options were found, which one was picked and, once
 * booked, what the booking is. A plan is planning only: it never becomes a
 * stay in the timeline and never touches visa or tax numbers.
 *
 * This file is pure: no Expo, no Firestore, no SQLite. The app uses it for
 * its forms and the agent API is bundled with it, so a price that the phone
 * accepts is a price the server accepts, and the other way round.
 */

import { countDays, fromYmd, toYmd } from './days';

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export const ACCOMMODATION_STATUSES = [
  'open',
  'searching',
  'options_available',
  'deciding',
  'selected',
  'booked',
  'checked_in',
  'completed',
  'cancelled',
] as const;
export type AccommodationStatus = (typeof ACCOMMODATION_STATUSES)[number];

export const STATUS_LABELS: Record<AccommodationStatus, string> = {
  open: 'Open',
  searching: 'Searching',
  options_available: 'Options found',
  deciding: 'Deciding',
  selected: 'Selected',
  booked: 'Booked',
  checked_in: 'Checked in',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * The order a plan normally moves through. Automatic changes (an option was
 * added, one was picked, a booking was saved) only ever move forward along
 * it; a person or an agent can set any status by hand.
 */
const STATUS_RANK: Record<AccommodationStatus, number> = {
  open: 0,
  searching: 1,
  options_available: 2,
  deciding: 3,
  selected: 4,
  booked: 5,
  checked_in: 6,
  completed: 7,
  cancelled: -1,
};

export const ACCOMMODATION_TYPES = [
  'hotel',
  'apartment',
  'airbnb',
  'condo',
  'hostel',
  'guesthouse',
  'coliving',
  'other',
] as const;
export type AccommodationType = (typeof ACCOMMODATION_TYPES)[number];

export const TYPE_LABELS: Record<AccommodationType, string> = {
  hotel: 'Hotel',
  apartment: 'Apartment',
  airbnb: 'Airbnb',
  condo: 'Condo',
  hostel: 'Hostel',
  guesthouse: 'Guesthouse',
  coliving: 'Coliving',
  other: 'Something else',
};

/** Amenities the app offers as chips. Any other word is kept as typed. */
export const KNOWN_AMENITIES: { key: string; label: string }[] = [
  { key: 'wifi', label: 'Fast Wi-Fi' },
  { key: 'desk', label: 'Desk' },
  { key: 'quiet', label: 'Quiet' },
  { key: 'ac', label: 'Air conditioning' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'washer', label: 'Washing machine' },
  { key: 'gym', label: 'Gym' },
  { key: 'pool', label: 'Pool' },
  { key: 'balcony', label: 'Balcony' },
  { key: 'parking', label: 'Parking' },
  { key: 'breakfast', label: 'Breakfast' },
];

export function amenityLabel(key: string): string {
  return KNOWN_AMENITIES.find((a) => a.key === key)?.label ?? key;
}

// ─── Shapes ──────────────────────────────────────────────────────────────────

export interface AccommodationRequirements {
  type: AccommodationType | null;
  budget_per_night: number | null;
  budget_total: number | null;
  /** ISO 4217. Required as soon as a budget is given. */
  currency: string | null;
  /** Neighbourhoods or areas to look in. */
  areas: string[];
  min_requirements: string | null;
  work_requirements: string | null;
  amenities: string[];
  dates_flexible: boolean;
  notes: string | null;
}

export interface AccommodationOption {
  id: string;
  name: string;
  platform: string | null;
  url: string | null;
  address: string | null;
  /** Defaults to the plan's dates; an option can differ (a night more or less). */
  check_in: string;
  check_out: string;
  total_price: number | null;
  price_per_night: number | null;
  currency: string | null;
  fees: number | null;
  rating: number | null;
  /** 5 (Airbnb, Google) or 10 (Booking.com). */
  rating_scale: 5 | 10;
  review_count: number | null;
  cancellation_policy: string | null;
  amenities: string[];
  /** Own verdict, 0 to 10. */
  score: number | null;
  risks: string | null;
  notes: string | null;
  /** When the listing was last looked at; prices move. ISO date-time. */
  last_checked_at: string | null;
  sort_order: number;
}

export interface AccommodationBooking {
  /** The option that was booked, when it came from the list. */
  option_id: string | null;
  booking_url: string | null;
  booking_reference: string | null;
  price: number | null;
  currency: string | null;
  address: string | null;
  check_in_info: string | null;
  check_out_info: string | null;
  deposit: number | null;
  deposit_currency: string | null;
  provider_contact: string | null;
  notes: string | null;
  /** Filled in after the stay. */
  review_rating: number | null;
  review_text: string | null;
}

export interface AccommodationPlan {
  /** The stop's id: a stop has at most one plan. */
  id: string;
  journey_id: string;
  stop_id: string;
  needed: boolean;
  status: AccommodationStatus;
  check_in: string;
  check_out: string;
  requirements: AccommodationRequirements;
  options: AccommodationOption[];
  selected_option_id: string | null;
  booking: AccommodationBooking | null;
  notes: string | null;
}

export const EMPTY_REQUIREMENTS: AccommodationRequirements = {
  type: null,
  budget_per_night: null,
  budget_total: null,
  currency: null,
  areas: [],
  min_requirements: null,
  work_requirements: null,
  amenities: [],
  dates_flexible: false,
  notes: null,
};

export const EMPTY_BOOKING: AccommodationBooking = {
  option_id: null,
  booking_url: null,
  booking_reference: null,
  price: null,
  currency: null,
  address: null,
  check_in_info: null,
  check_out_info: null,
  deposit: null,
  deposit_currency: null,
  provider_contact: null,
  notes: null,
  review_rating: null,
  review_text: null,
};

// ─── Errors ──────────────────────────────────────────────────────────────────

/** A value that cannot be stored, and which field it was. Message is for people. */
export class AccommodationValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'AccommodationValidationError';
  }
}

const fail = (field: string, message: string): never => {
  throw new AccommodationValidationError(field, message);
};

// ─── Dates ───────────────────────────────────────────────────────────────────

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day as YYYY-MM-DD; "2026-02-30" is not one. */
export function isValidYmd(value: unknown): value is string {
  return typeof value === 'string' && YMD.test(value) && toYmd(fromYmd(value)) === value;
}

export function dayAfter(ymd: string): string {
  const d = fromYmd(ymd);
  d.setDate(d.getDate() + 1);
  return toYmd(d);
}

/** Nights from check-in to check-out; 0 when check-out is not after check-in. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(0, countDays(fromYmd(checkIn), fromYmd(checkOut)) - 1);
}

/**
 * The stay a stop implies: in on the first day, out the morning after the
 * last one, so the nights equal the stop's days.
 */
export function defaultStay(stop: { start_date: string; end_date: string }): { check_in: string; check_out: string } {
  return { check_in: stop.start_date, check_out: dayAfter(stop.end_date) };
}

export function staysMatchStop(plan: { check_in: string; check_out: string }, stop: { start_date: string; end_date: string }): boolean {
  const d = defaultStay(stop);
  return plan.check_in === d.check_in && plan.check_out === d.check_out;
}

/**
 * Check-in and check-out as given, on top of `base` (what was there, or the
 * stop's default). Both must be real days and there must be at least one
 * night. Dates come from nowhere else, so a stop that moved does not move a
 * booking with it.
 */
export function normalizeStay(
  input: { check_in?: unknown; check_out?: unknown } | null | undefined,
  base: { check_in: string; check_out: string },
): { check_in: string; check_out: string } {
  const check_in = pickDate(input?.check_in, base.check_in, 'check_in');
  const check_out = pickDate(input?.check_out, base.check_out, 'check_out');
  if (check_out <= check_in) fail('check_out', 'check_out must be at least one day after check_in.');
  return { check_in, check_out };
}

function pickDate(value: unknown, fallback: string, field: string): string {
  if (value === undefined) return fallback;
  if (!isValidYmd(value)) return fail(field, `${field} must be a real day as YYYY-MM-DD.`);
  return value;
}

// ─── Scalars ─────────────────────────────────────────────────────────────────

const CURRENCY = /^[A-Z]{3}$/;
const MAX_AMOUNT = 10_000_000;

export function isValidCurrency(value: unknown): value is string {
  return typeof value === 'string' && CURRENCY.test(value);
}

/** Money is a number with two decimals and a currency beside it, never a string. */
function pickAmount(value: unknown, fallback: number | null, field: string): number | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(field, `${field} must be a number.`);
  if (value < 0) return fail(field, `${field} cannot be negative.`);
  if (value > MAX_AMOUNT) return fail(field, `${field} is implausibly large.`);
  return Math.round(value * 100) / 100;
}

function pickCurrency(value: unknown, fallback: string | null, field: string): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'string') return fail(field, `${field} must be an ISO 4217 code like "THB".`);
  const code = value.trim().toUpperCase();
  if (!CURRENCY.test(code)) return fail(field, `${field} must be an ISO 4217 code like "THB".`);
  return code;
}

function pickText(value: unknown, fallback: string | null, field: string, max: number): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'string') return fail(field, `${field} must be text.`);
  const text = value.trim().slice(0, max);
  if (!text) return null;
  if (containsCardNumber(text)) return fail(field, `${field} looks like it contains a payment card number. Nomadu does not store payment details.`);
  return text;
}

function pickUrl(value: unknown, fallback: string | null, field: string): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'string') return fail(field, `${field} must be a URL.`);
  const url = value.trim();
  if (!url) return null;
  if (url.length > 2000 || !/^https?:\/\/\S+$/i.test(url)) return fail(field, `${field} must be an http(s) URL.`);
  return url;
}

function pickBool(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') return fail(field, `${field} must be true or false.`);
  return value;
}

function pickInt(value: unknown, fallback: number | null, field: string, max: number): number | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) return fail(field, `${field} must be a whole number between 0 and ${max}.`);
  return value;
}

function pickScore(value: unknown, fallback: number | null, field: string, max: number): number | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) return fail(field, `${field} must be between 0 and ${max}.`);
  return Math.round(value * 10) / 10;
}

/**
 * A list of short words: trimmed, lower-cased, de-duplicated, capped. Given
 * as an array or as one comma-separated string, which is what a text field
 * in the app hands over.
 */
export function normalizeWordList(value: unknown, fallback: string[], field: string, { max = 20, each = 40 } = {}): string[] {
  if (value === undefined) return fallback;
  if (value === null) return [];
  const raw = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(raw)) return fail(field, `${field} must be a list of words.`);
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') return fail(field, `${field} must be a list of words.`);
    const word = item.trim().toLowerCase().slice(0, each);
    if (word && !out.includes(word)) out.push(word);
    if (out.length >= max) break;
  }
  return out;
}

function pickTimestamp(value: unknown, fallback: string | null, field: string): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'string') return fail(field, `${field} must be an ISO date-time.`);
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return fail(field, `${field} must be an ISO date-time.`);
  return t.toISOString();
}

/**
 * Does the text carry something that passes for a payment card number?
 * Thirteen to nineteen digits in a row (spaces and dashes allowed) that pass
 * the Luhn check. A booking reference is shorter or has letters, so it does
 * not trip this; a card number typed into "notes" does.
 */
export function containsCardNumber(text: string): boolean {
  const runs = text.replace(/[\s-]/g, '').match(/\d{13,19}/g);
  if (!runs) return false;
  return runs.some(luhn);
}

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

// ─── Records ─────────────────────────────────────────────────────────────────

function asObject(input: unknown, field: string): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) return fail(field, `${field} must be an object.`);
  return input as Record<string, unknown>;
}

/**
 * Requirements as given, on top of what was there. A field that is absent
 * keeps its value, `null` clears it. A budget without a currency is refused:
 * "1200" is not a budget.
 */
export function normalizeRequirements(input: unknown, existing: AccommodationRequirements = EMPTY_REQUIREMENTS): AccommodationRequirements {
  const x = asObject(input, 'requirements');
  let type: AccommodationType | null = existing.type;
  if (x.type === null) type = null;
  else if (x.type !== undefined) {
    if (typeof x.type !== 'string' || !(ACCOMMODATION_TYPES as readonly string[]).includes(x.type)) {
      fail('requirements.type', `requirements.type must be one of ${ACCOMMODATION_TYPES.join(', ')}.`);
    }
    type = x.type as AccommodationType;
  }
  const out: AccommodationRequirements = {
    type,
    budget_per_night: pickAmount(x.budget_per_night, existing.budget_per_night, 'requirements.budget_per_night'),
    budget_total: pickAmount(x.budget_total, existing.budget_total, 'requirements.budget_total'),
    currency: pickCurrency(x.currency, existing.currency, 'requirements.currency'),
    areas: normalizeWordList(x.areas, existing.areas, 'requirements.areas', { max: 10, each: 60 }),
    min_requirements: pickText(x.min_requirements, existing.min_requirements, 'requirements.min_requirements', 500),
    work_requirements: pickText(x.work_requirements, existing.work_requirements, 'requirements.work_requirements', 500),
    amenities: normalizeWordList(x.amenities, existing.amenities, 'requirements.amenities'),
    dates_flexible: pickBool(x.dates_flexible, existing.dates_flexible, 'requirements.dates_flexible'),
    notes: pickText(x.notes, existing.notes, 'requirements.notes', 1000),
  };
  if ((out.budget_per_night !== null || out.budget_total !== null) && !out.currency) {
    fail('requirements.currency', 'A budget needs a currency (ISO 4217, like "THB").');
  }
  return out;
}

/**
 * One researched option as given, on top of what was there. New options
 * need a name; everything else is optional but checked when present. Any
 * price needs a currency. Dates default to the plan's own.
 */
export function normalizeOption(
  input: unknown,
  existing: AccommodationOption | null,
  plan: { check_in: string; check_out: string },
): Omit<AccommodationOption, 'id' | 'sort_order'> {
  const x = asObject(input, 'option');
  const name = pickText(x.name, existing?.name ?? null, 'name', 120);
  if (!name) fail('name', 'An option needs a name.');
  const stay = normalizeStay(x, existing ? { check_in: existing.check_in, check_out: existing.check_out } : plan);

  let rating_scale: 5 | 10 = existing?.rating_scale ?? 5;
  if (x.rating_scale !== undefined) {
    if (x.rating_scale !== 5 && x.rating_scale !== 10) fail('rating_scale', 'rating_scale must be 5 or 10.');
    rating_scale = x.rating_scale as 5 | 10;
  }
  // Checked against the scale by hand so a Booking.com "8.7" without a
  // scale gets told what to send, not just that 8.7 is above 5.
  if (typeof x.rating === 'number' && x.rating > rating_scale && x.rating <= 10) {
    fail('rating', `rating ${x.rating} is above rating_scale ${rating_scale}. Send rating_scale: 10 for a 10-point platform.`);
  }
  const rating = pickScore(x.rating, existing?.rating ?? null, 'rating', rating_scale);

  const out = {
    name: name!,
    platform: pickText(x.platform, existing?.platform ?? null, 'platform', 40),
    url: pickUrl(x.url, existing?.url ?? null, 'url'),
    address: pickText(x.address, existing?.address ?? null, 'address', 200),
    check_in: stay.check_in,
    check_out: stay.check_out,
    total_price: pickAmount(x.total_price, existing?.total_price ?? null, 'total_price'),
    price_per_night: pickAmount(x.price_per_night, existing?.price_per_night ?? null, 'price_per_night'),
    currency: pickCurrency(x.currency, existing?.currency ?? null, 'currency'),
    fees: pickAmount(x.fees, existing?.fees ?? null, 'fees'),
    rating,
    rating_scale,
    review_count: pickInt(x.review_count, existing?.review_count ?? null, 'review_count', 10_000_000),
    cancellation_policy: pickText(x.cancellation_policy, existing?.cancellation_policy ?? null, 'cancellation_policy', 300),
    amenities: normalizeWordList(x.amenities, existing?.amenities ?? [], 'amenities'),
    score: pickScore(x.score, existing?.score ?? null, 'score', 10),
    risks: pickText(x.risks, existing?.risks ?? null, 'risks', 500),
    notes: pickText(x.notes, existing?.notes ?? null, 'notes', 1000),
    last_checked_at: pickTimestamp(x.last_checked_at, existing?.last_checked_at ?? null, 'last_checked_at'),
  };
  if ((out.total_price !== null || out.price_per_night !== null || out.fees !== null) && !out.currency) {
    fail('currency', 'A price needs a currency (ISO 4217, like "THB").');
  }
  return out;
}

/**
 * Booking details as given, on top of what was there. Only what a person
 * needs at the door: reference, link, price, address, how to get in, who to
 * call. Card numbers and passwords have no field and are refused in text.
 */
export function normalizeBooking(input: unknown, existing: AccommodationBooking | null): AccommodationBooking {
  const x = asObject(input, 'booking');
  const base = existing ?? EMPTY_BOOKING;
  let option_id = base.option_id;
  if (x.option_id === null) option_id = null;
  else if (x.option_id !== undefined) {
    if (typeof x.option_id !== 'string' || !x.option_id) fail('booking.option_id', 'booking.option_id must be an option id.');
    option_id = x.option_id as string;
  }
  const out: AccommodationBooking = {
    option_id,
    booking_url: pickUrl(x.booking_url, base.booking_url, 'booking.booking_url'),
    booking_reference: pickText(x.booking_reference, base.booking_reference, 'booking.booking_reference', 80),
    price: pickAmount(x.price, base.price, 'booking.price'),
    currency: pickCurrency(x.currency, base.currency, 'booking.currency'),
    address: pickText(x.address, base.address, 'booking.address', 300),
    check_in_info: pickText(x.check_in_info, base.check_in_info, 'booking.check_in_info', 1000),
    check_out_info: pickText(x.check_out_info, base.check_out_info, 'booking.check_out_info', 1000),
    deposit: pickAmount(x.deposit, base.deposit, 'booking.deposit'),
    deposit_currency: pickCurrency(x.deposit_currency, base.deposit_currency, 'booking.deposit_currency'),
    provider_contact: pickText(x.provider_contact, base.provider_contact, 'booking.provider_contact', 300),
    notes: pickText(x.notes, base.notes, 'booking.notes', 1000),
    review_rating: pickScore(x.review_rating, base.review_rating, 'booking.review_rating', 5),
    review_text: pickText(x.review_text, base.review_text, 'booking.review_text', 2000),
  };
  if (out.price !== null && !out.currency) fail('booking.currency', 'A price needs a currency (ISO 4217, like "THB").');
  // A deposit in the booking's currency unless told otherwise, stored
  // explicitly either way so the number never travels alone.
  if (out.deposit !== null && !out.deposit_currency) out.deposit_currency = out.currency;
  if (out.deposit !== null && !out.deposit_currency) fail('booking.deposit_currency', 'A deposit needs a currency (ISO 4217, like "THB").');
  return out;
}

export function normalizeStatus(value: unknown): AccommodationStatus {
  if (typeof value !== 'string' || !(ACCOMMODATION_STATUSES as readonly string[]).includes(value)) {
    return fail('status', `status must be one of ${ACCOMMODATION_STATUSES.join(', ')}.`);
  }
  return value as AccommodationStatus;
}

export function normalizeNotes(value: unknown, fallback: string | null): string | null {
  return pickText(value, fallback, 'notes', 2000);
}

// ─── Status arithmetic ───────────────────────────────────────────────────────

/**
 * Where a plan lands after something happened that implies `target`. Only
 * ever forward: adding an option to a booked plan does not un-book it, and
 * a cancelled plan stays cancelled until someone says otherwise.
 */
export function advanceStatus(current: AccommodationStatus, target: AccommodationStatus): AccommodationStatus {
  if (current === 'cancelled') return current;
  return STATUS_RANK[target] > STATUS_RANK[current] ? target : current;
}

/** After the selected option was removed: back to the options, or to the search. */
export function statusAfterUnselect(current: AccommodationStatus, optionsLeft: number): AccommodationStatus {
  if (current !== 'selected' && current !== 'deciding') return current;
  return optionsLeft > 0 ? 'options_available' : 'searching';
}

/** Is the plan past the point where options still matter? */
export function isSettled(status: AccommodationStatus): boolean {
  return STATUS_RANK[status] >= STATUS_RANK.booked;
}

// ─── Presentation helpers shared by app and API ──────────────────────────────

/** "1,200 THB" or "1,200.50 EUR"; null when either half is missing. */
export function formatMoney(amount: number | null, currency: string | null): string | null {
  if (amount === null || !currency) return null;
  const whole = Number.isInteger(amount);
  const text = amount.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  return `${text} ${currency}`;
}

/** The best price per night an option states or implies. */
export function optionNightlyPrice(option: AccommodationOption): number | null {
  if (option.price_per_night !== null) return option.price_per_night;
  if (option.total_price === null) return null;
  const nights = nightsBetween(option.check_in, option.check_out);
  return nights > 0 ? Math.round((option.total_price / nights) * 100) / 100 : null;
}

/** Sort a copy of the options for comparing: best first by the chosen key. */
export function sortOptions(options: AccommodationOption[], by: 'score' | 'price' | 'rating'): AccommodationOption[] {
  const missingLast = (v: number | null) => (v === null ? Number.POSITIVE_INFINITY : v);
  return [...options].sort((a, b) => {
    if (by === 'price') return missingLast(optionNightlyPrice(a)) - missingLast(optionNightlyPrice(b));
    const key = (o: AccommodationOption) => (by === 'score' ? o.score : o.rating === null ? null : (o.rating / o.rating_scale) * 10);
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb === null) return a.sort_order - b.sort_order;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return kb - ka;
  });
}

export function optionById(plan: Pick<AccommodationPlan, 'options'>, id: string | null): AccommodationOption | null {
  if (!id) return null;
  return plan.options.find((o) => o.id === id) ?? null;
}

/** The option that was picked or booked, for a one-line summary. */
export function primaryOption(plan: Pick<AccommodationPlan, 'options' | 'selected_option_id' | 'booking'>): AccommodationOption | null {
  return optionById(plan, plan.booking?.option_id ?? plan.selected_option_id);
}

// ─── Transitions ─────────────────────────────────────────────────────────────
// Every change to a plan goes through one of these. They are pure: the app
// runs them against a plan read from SQLite, the agent API against one read
// from Firestore, and both store what comes back. That is what keeps "adding
// an option marks the plan as having options" true on both sides.

/** Something the caller pointed at does not exist. The API answers 404. */
export class AccommodationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccommodationNotFoundError';
  }
}

export interface PlanInput {
  needed?: unknown;
  status?: unknown;
  check_in?: unknown;
  check_out?: unknown;
  requirements?: unknown;
  notes?: unknown;
}

function asPlanInput(input: unknown): PlanInput {
  return asObject(input, 'body') as PlanInput;
}

/** A fresh plan for a stop, from whatever the caller gave. */
export function createPlan(journeyId: string, stop: { id: string; start_date: string; end_date: string }, input: unknown = {}): AccommodationPlan {
  const x = asPlanInput(input);
  const stay = normalizeStay(x, defaultStay(stop));
  return {
    id: stop.id,
    journey_id: journeyId,
    stop_id: stop.id,
    needed: pickBool(x.needed, true, 'needed'),
    status: x.status === undefined ? 'open' : normalizeStatus(x.status),
    check_in: stay.check_in,
    check_out: stay.check_out,
    requirements: normalizeRequirements(x.requirements),
    options: [],
    selected_option_id: null,
    booking: null,
    notes: normalizeNotes(x.notes, null),
  };
}

/** The plan with the given fields changed. Options and booking are not touched here. */
export function updatePlan(plan: AccommodationPlan, input: unknown): AccommodationPlan {
  const x = asPlanInput(input);
  const stay = normalizeStay(x, plan);
  return {
    ...plan,
    needed: pickBool(x.needed, plan.needed, 'needed'),
    status: x.status === undefined ? plan.status : normalizeStatus(x.status),
    check_in: stay.check_in,
    check_out: stay.check_out,
    requirements: normalizeRequirements(x.requirements, plan.requirements),
    notes: normalizeNotes(x.notes, plan.notes),
  };
}

export const MAX_OPTIONS = 30;

/** One more researched option. A plan that was open or searching now has options. */
export function addOption(plan: AccommodationPlan, input: unknown, id: string): AccommodationPlan {
  if (plan.options.length >= MAX_OPTIONS) fail('options', `At most ${MAX_OPTIONS} options per stop. Remove one first.`);
  const fields = normalizeOption(input, null, plan);
  const option: AccommodationOption = { ...fields, id, sort_order: plan.options.length };
  return {
    ...plan,
    options: [...plan.options, option],
    status: advanceStatus(plan.status, 'options_available'),
  };
}

export function updateOption(plan: AccommodationPlan, optionId: string, input: unknown): AccommodationPlan {
  const existing = optionById(plan, optionId);
  if (!existing) throw new AccommodationNotFoundError('No such option.');
  const fields = normalizeOption(input, existing, plan);
  return {
    ...plan,
    options: plan.options.map((o) => (o.id === optionId ? { ...existing, ...fields } : o)),
  };
}

/** Drop an option. If it was the pick, the plan falls back to choosing. */
export function removeOption(plan: AccommodationPlan, optionId: string): AccommodationPlan {
  if (!optionById(plan, optionId)) throw new AccommodationNotFoundError('No such option.');
  const options = plan.options.filter((o) => o.id !== optionId).map((o, i) => ({ ...o, sort_order: i }));
  const wasSelected = plan.selected_option_id === optionId;
  return {
    ...plan,
    options,
    selected_option_id: wasSelected ? null : plan.selected_option_id,
    status: wasSelected ? statusAfterUnselect(plan.status, options.length) : plan.status,
    // The booking keeps its details; only the link to the list goes.
    booking: plan.booking?.option_id === optionId ? { ...plan.booking, option_id: null } : plan.booking,
  };
}

/** Pick an option (or none). A plan that is already booked keeps its status. */
export function selectOption(plan: AccommodationPlan, optionId: string | null): AccommodationPlan {
  if (optionId !== null && !optionById(plan, optionId)) throw new AccommodationNotFoundError('No such option.');
  return {
    ...plan,
    selected_option_id: optionId,
    status: optionId ? advanceStatus(plan.status, 'selected') : statusAfterUnselect(plan.status, plan.options.length),
  };
}

/**
 * Save what was booked. The booking links to the selected option unless
 * told otherwise, and the plan counts as booked from here on.
 */
export function saveBooking(plan: AccommodationPlan, input: unknown): AccommodationPlan {
  const booking = normalizeBooking(input, plan.booking);
  if (booking.option_id === null && plan.booking === null && plan.selected_option_id) {
    booking.option_id = plan.selected_option_id;
  }
  if (booking.option_id !== null && !optionById(plan, booking.option_id)) {
    throw new AccommodationNotFoundError('booking.option_id does not match any option of this stop.');
  }
  return {
    ...plan,
    booking,
    selected_option_id: booking.option_id ?? plan.selected_option_id,
    status: advanceStatus(plan.status, 'booked'),
  };
}

/** Forget the booking details. Status goes back to selected or the options. */
export function clearBooking(plan: AccommodationPlan): AccommodationPlan {
  const status: AccommodationStatus = plan.status === 'booked' || plan.status === 'checked_in' || plan.status === 'completed'
    ? plan.selected_option_id ? 'selected' : statusAfterUnselect('selected', plan.options.length)
    : plan.status;
  return { ...plan, booking: null, status };
}

export function setStatus(plan: AccommodationPlan, status: unknown): AccommodationPlan {
  return { ...plan, status: normalizeStatus(status) };
}

export function setNotes(plan: AccommodationPlan, notes: unknown): AccommodationPlan {
  return { ...plan, notes: normalizeNotes(notes, plan.notes) };
}
