import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculateAllVisaStatuses, parseDate, type VisaStatus } from '../../lib/visaCalculations';
import { getRuleForCitizen } from '../../constants/visaRules';
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

const statusFor = (trips: Trip[], citizenship: string, code: string, today: string): VisaStatus => {
  const status = calculateAllVisaStatuses(trips, citizenship, [], parseDate(today))
    .find((s) => s.destinationCode === code);
  assert.ok(status, `expected a status for ${code}`);
  return status;
};

// UK and Canada allow up to six months per visit, with no cap across visits.
for (const [code, citizenship] of [['GB', 'DE'], ['GB', 'US'], ['CA', 'US'], ['CA', 'DE']] as const) {
  describe(`${citizenship} passport in ${code}`, () => {
    test('the allowance is per visit, not per rolling year', () => {
      const rule = getRuleForCitizen(citizenship, code);
      assert.equal(rule?.ruleType, 'visa_free');
      assert.equal(rule?.allowedDays, 180);
      assert.equal(rule?.windowDays, 0);
    });

    test('a 150-day stay is within the allowance', () => {
      const s = statusFor([trip(code, '2026-01-01', '2026-05-30')], citizenship, code, '2026-05-30');
      assert.equal(s.daysUsed, 150);
      assert.equal(s.daysAllowed, 180);
      assert.notEqual(s.status, 'exceeded');
    });

    test('a single 190-day stay exceeds it', () => {
      const s = statusFor([trip(code, '2026-01-01', '2026-07-09')], citizenship, code, '2026-07-09');
      assert.equal(s.daysUsed, 190);
      assert.equal(s.status, 'exceeded');
    });

    test('two separate 120-day stays within a year are both fine', () => {
      const trips = [
        trip(code, '2026-01-01', '2026-04-30'),
        trip('MX', '2026-05-01', '2026-06-30'),
        trip(code, '2026-07-01', '2026-10-28'),
      ];
      const first = statusFor(trips, citizenship, code, '2026-04-30');
      assert.equal(first.daysUsed, 120);
      assert.equal(first.status, 'ok');

      const second = statusFor(trips, citizenship, code, '2026-10-28');
      assert.equal(second.daysUsed, 120);
      assert.equal(second.status, 'ok');
    });
  });
}

describe('Brazil', () => {
  for (const citizenship of ['US', 'CA', 'AU']) {
    test(`${citizenship} passport needs an e-Visa`, () => {
      const rule = getRuleForCitizen(citizenship, 'BR');
      assert.equal(rule?.ruleType, 'visa_required');
      assert.equal(rule?.label, 'e-Visa required');

      const s = statusFor([trip('BR', '2026-03-01', '2026-03-10')], citizenship, 'BR', '2026-03-10');
      assert.equal(s.status, 'visa_needed');
    });
  }

  test('passports still exempt keep 90 days', () => {
    const rule = getRuleForCitizen('DE', 'BR');
    assert.equal(rule?.ruleType, 'visa_free');
    assert.equal(rule?.allowedDays, 90);
  });
});

describe('Common Travel Area', () => {
  test('an Irish passport has no limit in the UK, and a British one none in Ireland', () => {
    assert.equal(getRuleForCitizen('IE', 'GB'), null);
    assert.equal(getRuleForCitizen('GB', 'IE'), null);
  });
});
