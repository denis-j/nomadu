import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculateAllTaxStatuses, type TaxStatus } from '../../lib/taxCalculations';
import type { Trip } from '../../lib/database';

let nextId = 1;
const trip = (country_code: string, start_date: string, end_date: string): Trip => ({
  id: nextId++,
  city: country_code,
  country: country_code,
  country_code,
  latitude: null,
  longitude: null,
  start_date,
  end_date,
  days: 0,
  sync_id: null,
  updated_at: null,
  deleted: 0,
});

const at = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

const statusFor = (trips: Trip[], code: string, year: number, today: string): TaxStatus | undefined =>
  calculateAllTaxStatuses(trips, 'DE', true, year, at(today)).find((s) => s.countryCode === code);

describe('UK tax year (6 April to 5 April)', () => {
  // The audit's case: split over two calendar years, 92 and 90 days, both
  // "safe"; in one UK tax year it is 182 days.
  const winter = [trip('GB', '2025-10-01', '2026-03-31')];

  test('October to March counts in one tax year', () => {
    const s = statusFor(winter, 'GB', 2025, '2026-06-01');
    assert.equal(s?.daysPresent, 182);
    assert.equal(s?.status, 'warning');
    assert.equal(s?.periodStart, '2025-04-06');
    assert.equal(s?.periodEnd, '2026-04-05');
    assert.equal(s?.ruleLabel, '183 days in the 2025/26 tax year (Apr 6 to Apr 5)');
  });

  test('in March, the current year shows the tax year still running', () => {
    const s = statusFor(winter, 'GB', 2026, '2026-03-31');
    assert.equal(s?.periodStart, '2025-04-06');
    assert.equal(s?.daysPresent, 182);
  });

  test('one more day makes it 183: resident', () => {
    const s = statusFor([trip('GB', '2025-10-01', '2026-04-01')], 'GB', 2025, '2026-06-01');
    assert.equal(s?.daysPresent, 183);
    assert.equal(s?.status, 'resident');
  });

  test('from April on, the current year is the new tax year', () => {
    const s = statusFor([...winter, trip('GB', '2026-04-10', '2026-04-19')], 'GB', 2026, '2026-06-01');
    assert.equal(s?.periodStart, '2026-04-06');
    assert.equal(s?.daysPresent, 10);
  });
});

describe('Australian income year (1 July to 30 June)', () => {
  test('a stay from August to May counts as one year', () => {
    const s = statusFor([trip('AU', '2025-08-01', '2026-05-31')], 'AU', 2025, '2026-07-15');
    assert.equal(s?.periodStart, '2025-07-01');
    assert.equal(s?.periodEnd, '2026-06-30');
    assert.equal(s?.daysPresent, 304);
    assert.equal(s?.status, 'resident');
  });
});

describe('New Zealand (any 12 months)', () => {
  test('a stay across New Year is counted as a whole', () => {
    // 1 Sep 2025 to 15 Mar 2026: 196 days, 74 of them in 2026.
    const s = statusFor([trip('NZ', '2025-09-01', '2026-03-15')], 'NZ', 2026, '2026-06-01');
    assert.equal(s?.daysPresent, 196);
    assert.equal(s?.status, 'resident');
    assert.equal(s?.periodEnd, '2026-03-15');
    assert.equal(s?.periodKind, 'rolling');
    assert.equal(s?.ruleLabel, '183 days in any 12 months');
  });

  test('days more than 12 months apart do not add up', () => {
    const s = statusFor([trip('NZ', '2025-01-01', '2025-03-31'), trip('NZ', '2026-02-01', '2026-04-30')], 'NZ', 2026, '2026-06-01');
    assert.equal(s?.daysPresent, 89);
  });
});

describe('everywhere else: the calendar year', () => {
  test('counted from January 1 to December 31, as before', () => {
    const trips = [trip('FR', '2025-10-01', '2026-03-31')];
    const s = statusFor(trips, 'FR', 2026, '2026-06-01');
    assert.equal(s?.daysPresent, 90);
    assert.equal(s?.periodStart, '2026-01-01');
    assert.equal(s?.periodEnd, '2026-12-31');
    assert.equal(s?.ruleLabel, '183 days in 2026');
    assert.equal(statusFor(trips, 'FR', 2025, '2026-06-01')?.daysPresent, 92);
  });

  test('days after today are not counted yet', () => {
    const s = statusFor([trip('FR', '2026-05-01', '2026-12-31')], 'FR', 2026, '2026-06-01');
    assert.equal(s?.daysPresent, 32);
  });
});
