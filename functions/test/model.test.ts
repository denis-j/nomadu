import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  AccommodationNotFoundError,
  AccommodationValidationError,
  MAX_OPTIONS,
  addOption,
  advanceStatus,
  clearBooking,
  containsCardNumber,
  createPlan,
  dayAfter,
  defaultStay,
  isValidYmd,
  nightsBetween,
  normalizeBooking,
  normalizeOption,
  normalizeRequirements,
  normalizeStay,
  optionNightlyPrice,
  removeOption,
  saveBooking,
  selectOption,
  sortOptions,
  statusAfterUnselect,
  staysMatchStop,
  updatePlan,
  type AccommodationPlan,
} from '../../lib/accommodationModel';

const stop = { id: 's1', start_date: '2026-11-01', end_date: '2026-11-04' };

const fails = (fn: () => unknown, field: string) => {
  assert.throws(fn, (err: unknown) => err instanceof AccommodationValidationError && err.field === field, `expected ${field} to be refused`);
};

describe('dates', () => {
  test('a day must exist on the calendar', () => {
    assert.equal(isValidYmd('2026-02-28'), true);
    assert.equal(isValidYmd('2026-02-30'), false);
    assert.equal(isValidYmd('2026-13-01'), false);
    assert.equal(isValidYmd('26-01-01'), false);
    assert.equal(isValidYmd(20260101), false);
  });

  test('the stop implies check-in on the first day and check-out the morning after the last', () => {
    assert.deepEqual(defaultStay(stop), { check_in: '2026-11-01', check_out: '2026-11-05' });
    assert.equal(nightsBetween('2026-11-01', '2026-11-05'), 4);
    assert.equal(nightsBetween('2026-11-05', '2026-11-01'), 0);
    assert.equal(dayAfter('2026-12-31'), '2027-01-01');
  });

  test('a stay needs at least one night and real days', () => {
    fails(() => normalizeStay({ check_in: '2026-11-05', check_out: '2026-11-05' }, defaultStay(stop)), 'check_out');
    fails(() => normalizeStay({ check_in: '2026-02-30' }, defaultStay(stop)), 'check_in');
    fails(() => normalizeStay({ check_out: 'tomorrow' }, defaultStay(stop)), 'check_out');
    assert.deepEqual(normalizeStay({ check_out: '2026-11-06' }, defaultStay(stop)), { check_in: '2026-11-01', check_out: '2026-11-06' });
  });

  test('a plan notices when its stop moved', () => {
    const plan = createPlan('j1', stop);
    assert.equal(staysMatchStop(plan, stop), true);
    assert.equal(staysMatchStop(plan, { ...stop, end_date: '2026-11-06' }), false);
  });
});

describe('requirements', () => {
  test('absent keeps, null clears, given replaces', () => {
    const first = normalizeRequirements({ type: 'apartment', budget_per_night: 40, currency: 'eur', areas: 'Old Quarter, Tay Ho', amenities: ['Wifi', 'wifi', 'Desk'] });
    assert.equal(first.type, 'apartment');
    assert.equal(first.currency, 'EUR');
    assert.deepEqual(first.areas, ['old quarter', 'tay ho']);
    assert.deepEqual(first.amenities, ['wifi', 'desk']);

    const second = normalizeRequirements({ notes: 'quiet street', budget_total: 500 }, first);
    assert.equal(second.type, 'apartment');
    assert.equal(second.budget_per_night, 40);
    assert.equal(second.budget_total, 500);
    assert.equal(second.notes, 'quiet street');

    const third = normalizeRequirements({ type: null, areas: null }, second);
    assert.equal(third.type, null);
    assert.deepEqual(third.areas, []);
  });

  test('a budget without a currency is not a budget', () => {
    fails(() => normalizeRequirements({ budget_per_night: 40 }), 'requirements.currency');
    fails(() => normalizeRequirements({ budget_per_night: 40, currency: 'euros' }), 'requirements.currency');
    fails(() => normalizeRequirements({ budget_per_night: '40', currency: 'EUR' }), 'requirements.budget_per_night');
    fails(() => normalizeRequirements({ budget_per_night: -1, currency: 'EUR' }), 'requirements.budget_per_night');
  });

  test('type and flexibility are checked', () => {
    fails(() => normalizeRequirements({ type: 'castle' }), 'requirements.type');
    fails(() => normalizeRequirements({ dates_flexible: 'yes' }), 'requirements.dates_flexible');
    assert.equal(normalizeRequirements({ dates_flexible: true }).dates_flexible, true);
  });
});

describe('options', () => {
  const plan = createPlan('j1', stop);

  test('needs a name, takes the plan dates by default', () => {
    fails(() => normalizeOption({ platform: 'Airbnb' }, null, plan), 'name');
    const o = normalizeOption({ name: 'Loft in Tay Ho' }, null, plan);
    assert.equal(o.check_in, '2026-11-01');
    assert.equal(o.check_out, '2026-11-05');
    assert.equal(o.rating_scale, 5);
  });

  test('prices carry a currency, ratings carry a scale', () => {
    fails(() => normalizeOption({ name: 'A', total_price: 400 }, null, plan), 'currency');
    fails(() => normalizeOption({ name: 'A', rating: 8.7 }, null, plan), 'rating');
    const o = normalizeOption({ name: 'A', total_price: 400.005, currency: 'usd', rating: 8.7, rating_scale: 10, review_count: 120 }, null, plan);
    assert.equal(o.total_price, 400.01);
    assert.equal(o.currency, 'USD');
    assert.equal(o.rating, 8.7);
    assert.equal(o.rating_scale, 10);
    fails(() => normalizeOption({ name: 'A', rating_scale: 7 }, null, plan), 'rating_scale');
    fails(() => normalizeOption({ name: 'A', score: 11 }, null, plan), 'score');
    fails(() => normalizeOption({ name: 'A', review_count: 1.5 }, null, plan), 'review_count');
  });

  test('links are http(s) or nothing', () => {
    fails(() => normalizeOption({ name: 'A', url: 'javascript:alert(1)' }, null, plan), 'url');
    fails(() => normalizeOption({ name: 'A', url: 'airbnb.com/rooms/1' }, null, plan), 'url');
    assert.equal(normalizeOption({ name: 'A', url: ' https://www.airbnb.com/rooms/1 ' }, null, plan).url, 'https://www.airbnb.com/rooms/1');
  });

  test('a nightly price is stated or derived from the total', () => {
    const base = { ...normalizeOption({ name: 'A', total_price: 400, currency: 'USD' }, null, plan), id: 'o', sort_order: 0 };
    assert.equal(optionNightlyPrice(base), 100);
    assert.equal(optionNightlyPrice({ ...base, price_per_night: 90 }), 90);
    assert.equal(optionNightlyPrice({ ...base, total_price: null }), null);
  });

  test('comparison puts the best first and the unknown last', () => {
    const mk = (id: string, extra: Record<string, unknown>) => ({ ...normalizeOption({ name: id, ...extra }, null, plan), id, sort_order: 0 });
    const a = mk('a', { score: 6 });
    const b = mk('b', { score: 9, price_per_night: 30, currency: 'USD' });
    const c = mk('c', { price_per_night: 20, currency: 'USD', rating: 9, rating_scale: 10 });
    assert.deepEqual(sortOptions([a, b, c], 'score').map((o) => o.id), ['b', 'a', 'c']);
    assert.deepEqual(sortOptions([a, b, c], 'price').map((o) => o.id), ['c', 'b', 'a']);
    assert.deepEqual(sortOptions([a, b, c], 'rating').map((o) => o.id), ['c', 'a', 'b']);
  });
});

describe('booking', () => {
  test('a deposit takes the booking currency unless told otherwise', () => {
    const b = normalizeBooking({ booking_reference: 'HX-2231', price: 380, currency: 'THB', deposit: 2000 }, null);
    assert.equal(b.deposit_currency, 'THB');
    const c = normalizeBooking({ deposit_currency: 'USD' }, b);
    assert.equal(c.deposit_currency, 'USD');
    assert.equal(c.booking_reference, 'HX-2231');
    fails(() => normalizeBooking({ price: 10 }, null), 'booking.currency');
    fails(() => normalizeBooking({ deposit: 10 }, null), 'booking.deposit_currency');
    fails(() => normalizeBooking({ review_rating: 6 }, null), 'booking.review_rating');
  });

  test('payment card numbers are refused wherever text is accepted', () => {
    assert.equal(containsCardNumber('4111 1111 1111 1111'), true);
    assert.equal(containsCardNumber('card 5500-0000-0000-0004 exp 12/28'), true);
    assert.equal(containsCardNumber('1234567890123456'), false);
    assert.equal(containsCardNumber('Booking 4429871122 confirmed'), false);
    fails(() => normalizeBooking({ notes: 'pay with 4111 1111 1111 1111' }, null), 'booking.notes');
    fails(() => normalizeOption({ name: 'A', risks: '4111111111111111' }, null, createPlan('j1', stop)), 'risks');
  });
});

describe('status', () => {
  test('automatic moves only go forward, cancelled stays put', () => {
    assert.equal(advanceStatus('open', 'options_available'), 'options_available');
    assert.equal(advanceStatus('booked', 'options_available'), 'booked');
    assert.equal(advanceStatus('cancelled', 'booked'), 'cancelled');
    assert.equal(statusAfterUnselect('selected', 2), 'options_available');
    assert.equal(statusAfterUnselect('selected', 0), 'searching');
    assert.equal(statusAfterUnselect('booked', 0), 'booked');
  });
});

describe('a plan through its life', () => {
  const fresh = (): AccommodationPlan => createPlan('j1', stop, { requirements: { type: 'hotel' } });

  test('starts open, gets options, a pick, a booking', () => {
    let plan = fresh();
    assert.equal(plan.status, 'open');
    assert.equal(plan.needed, true);

    plan = addOption(plan, { name: 'Hotel A', total_price: 400, currency: 'USD' }, 'a');
    plan = addOption(plan, { name: 'Hotel B', total_price: 300, currency: 'USD' }, 'b');
    assert.equal(plan.status, 'options_available');
    assert.deepEqual(plan.options.map((o) => o.sort_order), [0, 1]);

    plan = selectOption(plan, 'b');
    assert.equal(plan.status, 'selected');
    assert.equal(plan.selected_option_id, 'b');

    plan = saveBooking(plan, { booking_reference: 'B-1', price: 300, currency: 'USD' });
    assert.equal(plan.status, 'booked');
    assert.equal(plan.booking?.option_id, 'b');

    // More research after booking does not un-book.
    plan = addOption(plan, { name: 'Hotel C' }, 'c');
    assert.equal(plan.status, 'booked');

    plan = clearBooking(plan);
    assert.equal(plan.booking, null);
    assert.equal(plan.status, 'selected');
  });

  test('removing the pick falls back to the list, removing the booked option keeps the booking', () => {
    let plan = addOption(fresh(), { name: 'A' }, 'a');
    plan = selectOption(plan, 'a');
    plan = removeOption(plan, 'a');
    assert.equal(plan.selected_option_id, null);
    assert.equal(plan.status, 'searching');

    plan = addOption(plan, { name: 'B' }, 'b');
    plan = saveBooking(selectOption(plan, 'b'), { booking_reference: 'X' });
    plan = removeOption(plan, 'b');
    assert.equal(plan.status, 'booked');
    assert.equal(plan.booking?.booking_reference, 'X');
    assert.equal(plan.booking?.option_id, null);
  });

  test('points at things that must exist', () => {
    const plan = addOption(fresh(), { name: 'A' }, 'a');
    assert.throws(() => selectOption(plan, 'nope'), AccommodationNotFoundError);
    assert.throws(() => removeOption(plan, 'nope'), AccommodationNotFoundError);
    assert.throws(() => saveBooking(plan, { option_id: 'nope' }), AccommodationNotFoundError);
    fails(() => updatePlan(plan, { status: 'lost' }), 'status');
  });

  test('updating never touches options or booking', () => {
    let plan = saveBooking(addOption(fresh(), { name: 'A' }, 'a'), { booking_reference: 'R' });
    plan = updatePlan(plan, { needed: false, notes: 'maybe stay with friends', requirements: { type: 'hostel' } });
    assert.equal(plan.needed, false);
    assert.equal(plan.requirements.type, 'hostel');
    assert.equal(plan.options.length, 1);
    assert.equal(plan.booking?.booking_reference, 'R');
  });

  test('there is a ceiling on options', () => {
    let plan = fresh();
    for (let i = 0; i < MAX_OPTIONS; i++) plan = addOption(plan, { name: `O${i}` }, `o${i}`);
    fails(() => addOption(plan, { name: 'one more' }, 'x'), 'options');
  });
});
