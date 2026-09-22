import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Timestamp, __get, __reset, __seed } from './fakeFirestore';
import { TTL_DAYS, cachedCityTips, tipsKey } from '../src/cityTips';
import { avatarSeed } from '../../lib/avatarSeed';

beforeEach(() => __reset());

describe('city tips cache', () => {
  test('the key ignores case, accents and punctuation', () => {
    assert.equal(tipsKey('Hà Nội', 'Viet Nam'), 'viet_nam__ha_noi');
    assert.equal(tipsKey('hanoi', 'vietnam'), 'vietnam__hanoi');
    assert.equal(tipsKey('Ho Chi Minh City', 'Vietnam'), tipsKey('  ho chi minh  city ', 'VIETNAM'));
    assert.equal(tipsKey('São Paulo', 'Brazil'), 'brazil__sao_paulo');
    assert.equal(tipsKey('', ''), 'unknown__unknown');
  });

  test('the first caller generates, the second reads it back', async () => {
    let runs = 0;
    const generate = async () => { runs += 1; return `- **Stay** tips ${runs}`; };
    const first = await cachedCityTips('Lisbon', 'Portugal', generate);
    assert.deepEqual(first, { tips: '- **Stay** tips 1', generated: true });

    const second = await cachedCityTips('lisbon', 'portugal', generate);
    assert.deepEqual(second, { tips: '- **Stay** tips 1', generated: false });
    assert.equal(runs, 1);

    const stored = __get('city_tips/portugal__lisbon');
    assert.equal(stored?.tips, '- **Stay** tips 1');
    assert.ok(stored?.expiresAt instanceof Timestamp);
  });

  test('a stale entry is regenerated', async () => {
    const old = new Date('2026-01-01T00:00:00Z');
    __seed('city_tips/portugal__lisbon', { tips: 'old', expiresAt: Timestamp.fromDate(old) });
    const later = new Date(old.getTime() + (TTL_DAYS + 1) * 86_400_000);
    const out = await cachedCityTips('Lisbon', 'Portugal', async () => 'new', later);
    assert.deepEqual(out, { tips: 'new', generated: true });
    assert.equal(__get('city_tips/portugal__lisbon')?.tips, 'new');
  });

  test('a fresh entry is served until it expires', async () => {
    const now = new Date('2026-09-22T12:00:00Z');
    const expires = new Date(now.getTime() + 86_400_000);
    __seed('city_tips/portugal__lisbon', { tips: 'fresh', expiresAt: Timestamp.fromDate(expires) });
    const out = await cachedCityTips('Lisbon', 'Portugal', async () => { throw new Error('should not run'); }, now);
    assert.deepEqual(out, { tips: 'fresh', generated: false });
  });

  test('a failed generation leaves nothing behind', async () => {
    await assert.rejects(cachedCityTips('Lisbon', 'Portugal', async () => { throw new Error('quota'); }));
    assert.equal(__get('city_tips/portugal__lisbon'), undefined);
  });
});

describe('avatar seeds', () => {
  test('are stable, short and never the id itself', () => {
    assert.equal(avatarSeed('owner'), avatarSeed('owner'));
    assert.notEqual(avatarSeed('owner'), avatarSeed('anna'));
    assert.match(avatarSeed('CV9MFlOPHldsqfNsHv52BLtzmCQ2'), /^[0-9a-f]{16}$/);
    assert.equal(avatarSeed(null), 'unknown');
    assert.equal(avatarSeed(''), 'unknown');
  });
});
