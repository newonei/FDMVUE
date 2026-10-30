import { getCurrentTimezone, setCurrentTimezone } from '@vben/utils';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatTemporalField } from './date-display';

const originalTimezone = getCurrentTimezone();

beforeEach(() => setCurrentTimezone('Asia/Shanghai'));
afterEach(() => {
  setCurrentTimezone(originalTimezone);
  vi.restoreAllMocks();
});

describe('business date display', () => {
  it('shows attachment milliseconds, numeric strings and ISO instants in the selected timezone', () => {
    for (const value of [
      1_789_973_875_794,
      '1789973875794',
      '2026-09-21T06:57:55.794Z',
      new Date('2026-09-21T06:57:55.794Z'),
    ])
      expect(formatTemporalField('createdAt', value)).toBe(
        '2026-09-21 14:57:55',
      );
    setCurrentTimezone('UTC');
    expect(formatTemporalField('createdAt', 1_789_973_875_794)).toBe(
      '2026-09-21 06:57:55',
    );
  });

  it('preserves calendar dates and distinguishes business dates from event times', () => {
    setCurrentTimezone('Pacific/Honolulu');
    for (const field of [
      'signedDate',
      'receivedAt',
      'issuedAt',
      'paidAt',
      'validUntil',
      'exchangeRateDate',
    ])
      expect(formatTemporalField(field, '2026-09-21')).toBe('2026-09-21');
    setCurrentTimezone('Asia/Shanghai');
    expect(formatTemporalField('receivedAt', 1_789_973_875_794)).toBe(
      '2026-09-21',
    );
    for (const field of [
      'created_at',
      'at',
      'exchangeRateFetchedAt',
      'item.occurredAt',
    ])
      expect(formatTemporalField(field, 1_789_973_875_794)).toBe(
        '2026-09-21 14:57:55',
      );
  });

  it('keeps unknown date values missing and leaves identifiers and durations to their own renderers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const value of [undefined, null, '', 'invalid', Number.NaN, {}, []])
      expect(formatTemporalField('createdAt', value)).toBe('—');
    for (const value of ['2026-99-99', '2026-02-30'])
      expect(formatTemporalField('signedDate', value)).toBe('—');
    expect(formatTemporalField('createdAt', 0)).toBe('1970-01-01 08:00:00');
    for (const field of [
      'id',
      'eventId',
      'amount',
      'durationMs',
      'leadTimeDays',
      'state',
    ])
      expect(formatTemporalField(field, 1_789_973_875_794)).toBeUndefined();
  });
});
