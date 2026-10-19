import { describe, expect, it } from 'vitest';

import { channelFilter, salesChannelOf } from './sales-channel';

describe('sales channel', () => {
  it('treats everything except DOMESTIC as foreign trade', () => {
    expect(salesChannelOf('DOMESTIC')).toBe('DOMESTIC');
    for (const value of [
      undefined,
      null,
      '',
      'FOREIGN',
      'SAMPLE',
      'GOVERNMENT',
    ])
      expect(salesChannelOf(value)).toBe('FOREIGN');
  });

  it('drops the channel filter when a contract is already selected', () => {
    expect(channelFilter('DOMESTIC')).toBe('DOMESTIC');
    expect(channelFilter('DOMESTIC', 'contract-1')).toBeUndefined();
    expect(channelFilter(undefined)).toBeUndefined();
  });
});
