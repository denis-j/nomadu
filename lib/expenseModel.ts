/**
 * Expenses on a trip: the shape of the data and the rules it must obey.
 *
 * An expense is money one traveller paid, split among some of the others
 * by amount. Many per trip, each its own record, so two people adding
 * dinners never write over each other. From the records follow the sums:
 * what the trip cost, what each person's part is, and who owes whom.
 * Planning and keeping track only: nothing here touches the timeline,
 * visas or taxes.
 *
 * Pure, like lib/activityModel.ts: the app uses it for its forms, the
 * Functions (agent API, friends who plan along) are bundled with it, so
 * what one side accepts the other does.
 */

import { invalid, isValidYmd, pickAmount, pickCurrency, pickText } from './accommodationModel';

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = ['food', 'drinks', 'transport', 'stay', 'activity', 'groceries', 'shopping', 'other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: 'Food',
  drinks: 'Drinks',
  transport: 'Transport',
  stay: 'Stay',
  activity: 'Activity',
  groceries: 'Groceries',
  shopping: 'Shopping',
  other: 'Other',
};

/** Ionicons per category, for the rows and the chips. */
export const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  food: 'restaurant-outline',
  drinks: 'wine-outline',
  transport: 'car-outline',
  stay: 'bed-outline',
  activity: 'ticket-outline',
  groceries: 'basket-outline',
  shopping: 'bag-handle-outline',
  other: 'receipt-outline',
};

/** Typed in, read off a receipt photo, or filed by the user's agent. */
export const EXPENSE_SOURCES = ['manual', 'receipt', 'agent'] as const;
export type ExpenseSource = (typeof EXPENSE_SOURCES)[number];

/** One person's part of an expense, in the expense's currency. */
export interface ExpenseShare {
  /** The traveller's id (the stop-independent `sync_id` of the journey's traveller). */
  traveller_id: string;
  amount: number;
}

export interface Expense {
  /** Its own id (UUID); the cloud document id too. */
  id: string;
  journey_id: string;
  /** The stop it happened at, by sync id; null when none fits. */
  stop_id: string | null;
  title: string;
  amount: number;
  /** ISO 4217. */
  currency: string;
  /** Who paid, as a traveller id; null when nobody said. */
  paid_by: string | null;
  /** Who it is split among and how much each. Empty: not split, the payer's own. */
  shares: ExpenseShare[];
  /** The day it was paid, YYYY-MM-DD. */
  date: string;
  category: ExpenseCategory;
  notes: string | null;
  /** The receipt, as the sync id of a journey document of kind "receipt". */
  receipt_document_id: string | null;
  source: ExpenseSource;
  updated_at: string;
  deleted: boolean;
}

/** At most this many per journey, so a runaway agent cannot fill a trip. */
export const MAX_EXPENSES_PER_JOURNEY = 1000;

/** The editable fields of an expense. */
export type ExpenseFields = Omit<Expense, 'id' | 'journey_id' | 'stop_id' | 'updated_at' | 'deleted'>;

// ─── Splitting ───────────────────────────────────────────────────────────────

/** Cents, so sums of shares come out exact. */
const cents = (n: number) => Math.round(n * 100);

/**
 * The amount split equally among the travellers, to the cent: 10 among
 * three is 3.34, 3.33, 3.33, the odd cents going to the first ones.
 */
export function equalShares(amount: number, travellerIds: string[]): ExpenseShare[] {
  const ids = [...new Set(travellerIds)];
  if (ids.length === 0) return [];
  const total = cents(amount);
  const base = Math.floor(total / ids.length);
  let rest = total - base * ids.length;
  return ids.map((id) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return { traveller_id: id, amount: (base + extra) / 100 };
  });
}

/** The same split, scaled to a new amount: equal stays equal, a 70/30 stays 70/30. */
export function rescaleShares(shares: ExpenseShare[], amount: number): ExpenseShare[] {
  const old = shares.reduce((s, x) => s + cents(x.amount), 0);
  if (shares.length === 0 || old === 0) return equalShares(amount, shares.map((s) => s.traveller_id));
  const total = cents(amount);
  const scaled = shares.map((s) => Math.floor((cents(s.amount) * total) / old));
  let rest = total - scaled.reduce((a, b) => a + b, 0);
  return shares.map((s, i) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return { traveller_id: s.traveller_id, amount: (scaled[i] + extra) / 100 };
  });
}

/** Does every share carry the same amount, give or take the odd cent? */
export function isEqualSplit(shares: ExpenseShare[]): boolean {
  if (shares.length < 2) return true;
  const all = shares.map((s) => cents(s.amount));
  return Math.max(...all) - Math.min(...all) <= 1;
}

/** This traveller's part of the expense, 0 when they are not in it. */
export function shareOf(expense: Pick<Expense, 'shares'>, travellerId: string | null): number {
  if (!travellerId) return 0;
  return expense.shares.find((s) => s.traveller_id === travellerId)?.amount ?? 0;
}

// ─── Sums ────────────────────────────────────────────────────────────────────

export interface Balance {
  traveller_id: string;
  currency: string;
  /** What they laid out. */
  paid: number;
  /** Their part of everything, their own expenses included. */
  owed: number;
  /** paid minus owed: positive gets money back, negative owes. */
  net: number;
}

export interface Transfer {
  /** Who pays whom to even out, in this currency. */
  from: string;
  to: string;
  amount: number;
  currency: string;
}

type Summable = Pick<Expense, 'amount' | 'currency' | 'paid_by' | 'shares' | 'deleted'>;

/** What the trip cost, per currency, the biggest first. No exchange rates: a sum in baht stays in baht. */
export function totals(expenses: Summable[]): { currency: string; total: number }[] {
  const sums = new Map<string, number>();
  for (const e of expenses) {
    if (e.deleted) continue;
    sums.set(e.currency, (sums.get(e.currency) ?? 0) + cents(e.amount));
  }
  return [...sums].map(([currency, total]) => ({ currency, total: total / 100 })).sort((a, b) => b.total - a.total);
}

/**
 * Per traveller and currency: what they paid, what their part is, and the
 * difference. An expense that is not split counts as the payer's own part.
 */
export function balances(expenses: Summable[]): Balance[] {
  const rows = new Map<string, { paid: number; owed: number }>();
  const row = (traveller: string, currency: string) => {
    const key = `${currency}|${traveller}`;
    let r = rows.get(key);
    if (!r) {
      r = { paid: 0, owed: 0 };
      rows.set(key, r);
    }
    return r;
  };
  for (const e of expenses) {
    if (e.deleted) continue;
    if (e.paid_by) row(e.paid_by, e.currency).paid += cents(e.amount);
    if (e.shares.length === 0) {
      if (e.paid_by) row(e.paid_by, e.currency).owed += cents(e.amount);
    } else {
      for (const s of e.shares) row(s.traveller_id, e.currency).owed += cents(s.amount);
    }
  }
  return [...rows].map(([key, r]) => {
    const [currency, traveller_id] = key.split('|');
    return { traveller_id, currency, paid: r.paid / 100, owed: r.owed / 100, net: (r.paid - r.owed) / 100 };
  });
}

/**
 * The fewest payments that even everyone out, per currency: the biggest
 * debtor pays the biggest creditor, and so on. Money someone owes to
 * nobody (an expense with shares but no payer) is left where it is.
 */
export function settleUp(expenses: Summable[]): Transfer[] {
  const out: Transfer[] = [];
  const byCurrency = new Map<string, Balance[]>();
  for (const b of balances(expenses)) {
    const list = byCurrency.get(b.currency) ?? [];
    list.push(b);
    byCurrency.set(b.currency, list);
  }
  for (const [currency, list] of byCurrency) {
    // Biggest first, ties by id, so the same records always give the same payments.
    const byLeft = (a: { id: string; left: number }, b: { id: string; left: number }) => b.left - a.left || a.id.localeCompare(b.id);
    const creditors = list.filter((b) => cents(b.net) > 0).map((b) => ({ id: b.traveller_id, left: cents(b.net) })).sort(byLeft);
    const debtors = list.filter((b) => cents(b.net) < 0).map((b) => ({ id: b.traveller_id, left: -cents(b.net) })).sort(byLeft);
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(debtors[i].left, creditors[j].left);
      if (amount > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: amount / 100, currency });
      debtors[i].left -= amount;
      creditors[j].left -= amount;
      if (debtors[i].left === 0) i++;
      if (creditors[j].left === 0) j++;
    }
  }
  return out;
}

// ─── Checks ──────────────────────────────────────────────────────────────────

function asObject(input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) return invalid('expense', 'An expense must be an object.');
  return input as Record<string, unknown>;
}

function pickChoice<T extends string>(value: unknown, fallback: T, field: string, choices: readonly T[]): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !(choices as readonly string[]).includes(value)) {
    return invalid(field, `${field} must be one of ${choices.join(', ')}.`);
  }
  return value as T;
}

function pickId(value: unknown, fallback: string | null, field: string): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 80) return invalid(field, `${field} must be a traveller id or null.`);
  return value.trim();
}

function pickShares(value: unknown, fallback: ExpenseShare[], amount: number, field: string): ExpenseShare[] {
  if (value === undefined) return fallback;
  if (value === null) return [];
  if (!Array.isArray(value)) return invalid(field, `${field} must be a list of {traveller_id, amount}.`);
  const out: ExpenseShare[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return invalid(field, `${field} must be a list of {traveller_id, amount}.`);
    const x = item as Record<string, unknown>;
    const id = pickId(x.traveller_id, null, `${field}.traveller_id`);
    if (!id) return invalid(field, 'Each share needs a traveller_id.');
    const part = pickAmount(x.amount, null, `${field}.amount`);
    if (part === null) return invalid(field, 'Each share needs an amount.');
    if (out.some((s) => s.traveller_id === id)) return invalid(field, 'A traveller appears twice in the shares.');
    out.push({ traveller_id: id, amount: part });
  }
  const sum = out.reduce((s, x) => s + cents(x.amount), 0);
  if (out.length > 0 && Math.abs(sum - cents(amount)) > 5) {
    return invalid(field, `The shares add up to ${sum / 100}, the expense is ${amount}.`);
  }
  return out;
}

/**
 * An expense as given, on top of what was there. A new one needs a title,
 * an amount and a currency; everything else is optional but checked when
 * present. A field that is absent keeps its value, `null` clears it.
 *
 * The split is given either as `split_among` (traveller ids, split
 * equally) or as `shares` (ids with amounts that add up). When only the
 * amount changes, the old split is scaled to it. `today` is the date a new
 * expense gets when none is given.
 */
export function normalizeExpense(input: unknown, existing: ExpenseFields | null = null, options: { today?: string } = {}): ExpenseFields {
  const x = asObject(input);
  const title = pickText(x.title, existing?.title ?? null, 'title', 120);
  if (!title) invalid('title', 'An expense needs a title.');
  const amount = pickAmount(x.amount, existing?.amount ?? null, 'amount');
  if (amount === null) invalid('amount', 'An expense needs an amount.');
  if (amount! <= 0) invalid('amount', 'The amount must be more than 0.');
  const currency = pickCurrency(x.currency, existing?.currency ?? null, 'currency');
  if (!currency) invalid('currency', 'An amount needs a currency (ISO 4217, like "THB").');

  let shares: ExpenseShare[];
  if (x.split_among !== undefined) {
    if (x.split_among === null) shares = [];
    else {
      if (!Array.isArray(x.split_among) || x.split_among.some((v) => typeof v !== 'string' || !v.trim())) {
        return invalid('split_among', 'split_among must be a list of traveller ids.');
      }
      shares = equalShares(amount!, (x.split_among as string[]).map((v) => v.trim()));
    }
  } else {
    const base = existing?.shares ?? [];
    shares = pickShares(x.shares, base, amount!, 'shares');
    if (x.shares === undefined && existing && cents(existing.amount) !== cents(amount!) && base.length > 0) {
      shares = rescaleShares(base, amount!);
    }
  }

  const date = x.date === undefined ? existing?.date ?? options.today ?? null : x.date;
  if (!isValidYmd(date)) invalid('date', 'date must be a real day as YYYY-MM-DD.');

  const receipt = x.receipt_document_id;
  let receipt_document_id = existing?.receipt_document_id ?? null;
  if (receipt === null) receipt_document_id = null;
  else if (receipt !== undefined) {
    if (typeof receipt !== 'string' || !receipt.trim() || receipt.length > 80) invalid('receipt_document_id', 'receipt_document_id must be a document id or null.');
    receipt_document_id = (receipt as string).trim();
  }

  return {
    title: title!,
    amount: amount!,
    currency: currency!,
    paid_by: pickId(x.paid_by, existing?.paid_by ?? null, 'paid_by'),
    shares,
    date: date as string,
    category: pickChoice(x.category, existing?.category ?? 'other', 'category', EXPENSE_CATEGORIES),
    notes: pickText(x.notes, existing?.notes ?? null, 'notes', 1000),
    receipt_document_id,
    source: pickChoice(x.source, existing?.source ?? 'manual', 'source', EXPENSE_SOURCES),
  };
}

/** The stop whose days hold the date, for an expense that did not say; null when none does. */
export function stopIdForDate(stops: { id: string | null; start_date: string; end_date: string }[], date: string): string | null {
  return stops.find((s) => s.id && s.start_date <= date && date <= s.end_date)?.id ?? null;
}

/** A category from the words of a title: "Taxi to the airport" is transport. The rest is "other". */
export function guessCategory(title: string): ExpenseCategory {
  const t = title.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));
  if (has('taxi', 'grab', 'uber', 'bolt', 'train', 'bus', 'metro', 'flight', 'ferry', 'fuel', 'petrol', 'parking', 'scooter', 'ride')) return 'transport';
  if (has('hotel', 'airbnb', 'hostel', 'room', 'night', 'apartment', 'stay')) return 'stay';
  if (has('beer', 'wine', 'bar', 'drink', 'cocktail', 'pub', 'coffee', 'café', 'cafe')) return 'drinks';
  if (has('dinner', 'lunch', 'breakfast', 'brunch', 'restaurant', 'pizza', 'food', 'burger', 'sushi', 'noodle', 'pho', 'street food', 'snack')) return 'food';
  if (has('supermarket', 'groceries', 'market', 'water', '7-eleven', 'seven eleven')) return 'groceries';
  if (has('ticket', 'museum', 'tour', 'entry', 'entrance', 'temple', 'park', 'show', 'class', 'dive', 'surf', 'massage', 'spa')) return 'activity';
  if (has('shop', 'souvenir', 'clothes', 'pharmacy', 'mall')) return 'shopping';
  return 'other';
}

/** "1,240" or "12.50": an amount without its currency, for a row with the code set apart. */
export function formatAmount(amount: number): string {
  const whole = Number.isInteger(amount);
  return amount.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/** Newest day first, then the newest edit first, so a dinner typed in a moment ago is on top. */
export function sortExpenses<T extends Pick<Expense, 'date' | 'updated_at'>>(list: T[]): T[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at));
}

// ─── Typed in one line ───────────────────────────────────────────────────────

/** The symbols people type, to the codes they mean. */
const SYMBOLS: Record<string, string> = { '€': 'EUR', '$': 'USD', '£': 'GBP', '¥': 'JPY', '฿': 'THB', '₫': 'VND', '₩': 'KRW', '₹': 'INR', '₱': 'PHP' };
/** Codes recognised in lower case too; any other three letters are a word, not a currency. */
const KNOWN_CODES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'THB', 'VND', 'IDR', 'MYR', 'SGD', 'KRW', 'AUD', 'NZD', 'CAD', 'MXN', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'INR', 'LKR', 'NPR', 'PHP', 'KHR', 'LAK', 'CNY', 'HKD', 'TWD', 'CZK', 'PLN', 'HUF', 'RON', 'TRY', 'GEL', 'AED', 'EGP', 'MAD', 'ZAR', 'KES', 'DKK', 'NOK', 'SEK', 'ISK'];

/**
 * "1.200,50", "1,200.50", "12,50", "12.5", "1200": the number people
 * write, whichever side of the comma they grew up on.
 */
function parseTypedAmount(raw: string): number | null {
  const s = raw.replace(/\s/g, '');
  const dot = s.lastIndexOf('.');
  const comma = s.lastIndexOf(',');
  let normalized: string;
  if (dot >= 0 && comma >= 0) {
    // Both: the later one is the decimal mark, the other groups thousands.
    normalized = dot > comma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (dot >= 0 || comma >= 0) {
    const sep = dot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    // One mark followed by exactly three digits is a thousands group; by one or two, decimals.
    normalized = parts.length === 2 && parts[1].length !== 3 ? `${parts[0]}.${parts[1]}` : parts.join('');
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export interface QuickEntry {
  title: string;
  amount: number;
  /** The code typed, or `fallback` when none was. */
  currency: string;
}

/**
 * One line like "Dinner 42", "Taxi 12,50€", "$15 lunch" or "Beer 3.5 EUR",
 * taken apart into what, how much and in what. Null when there is no
 * number in it. The title is what is left; empty when only a number was
 * typed, so the caller can fall back to the category.
 */
export function parseQuickEntry(text: string, fallback: string): QuickEntry | null {
  const line = text.trim();
  if (!line) return null;
  const number = /(?:([€$£¥฿₫₩₹₱])\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*([€$£¥฿₫₩₹₱])|\s*([A-Za-z]{3})(?![A-Za-z]))?/;
  const m = number.exec(line);
  if (!m) return null;
  const amount = parseTypedAmount(m[2]);
  if (amount === null) return null;
  let currency = fallback;
  let consumed = m[0];
  const symbol = m[1] ?? m[3];
  if (symbol) currency = SYMBOLS[symbol];
  else if (m[4]) {
    const code = m[4].toUpperCase();
    if (KNOWN_CODES.includes(code) || m[4] === code) currency = code;
    // A word that only looked like a code stays in the title.
    else consumed = m[0].slice(0, m[0].length - m[4].length).trimEnd();
  }
  const title = (line.slice(0, m.index) + ' ' + line.slice(m.index + consumed.length))
    .replace(/\s+/g, ' ')
    .replace(/^[\s:,.\-–]+|[\s:,.\-–]+$/g, '')
    .trim();
  return { title: title ? title[0].toUpperCase() + title.slice(1) : '', amount, currency };
}
