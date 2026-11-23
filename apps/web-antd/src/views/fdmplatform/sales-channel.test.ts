import { describe, expect, it } from 'vitest';

import {
  channelFilter,
  contractAiCheckType,
  isSampleBusinessType,
  salesChannelOf,
  sampleBusinessType,
} from './sales-channel';

describe('sales channel', () => {
  it('treats everything except domestic and domestic samples as foreign trade', () => {
    expect(salesChannelOf('DOMESTIC')).toBe('DOMESTIC');
    expect(salesChannelOf('DOMESTIC_SAMPLE')).toBe('DOMESTIC');
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

  it('keeps samples within their business line', () => {
    expect(sampleBusinessType('DOMESTIC')).toBe('DOMESTIC_SAMPLE');
    expect(sampleBusinessType('FOREIGN')).toBe('SAMPLE');
    expect(isSampleBusinessType('DOMESTIC_SAMPLE')).toBe(true);
    expect(isSampleBusinessType('SAMPLE')).toBe(true);
    expect(isSampleBusinessType('DOMESTIC')).toBe(false);
  });

  it('routes samples and legacy contracts to their business line check', () => {
    expect(contractAiCheckType('DOMESTIC')).toBe('CONTRACT_DOMESTIC');
    expect(contractAiCheckType('DOMESTIC_SAMPLE')).toBe('CONTRACT_DOMESTIC');
    expect(contractAiCheckType('SAMPLE')).toBe('CONTRACT_FOREIGN');
    expect(contractAiCheckType(null)).toBe('CONTRACT_FOREIGN');
  });

  it('drops the channel filter when a contract is already selected', () => {
    expect(channelFilter('DOMESTIC')).toBe('DOMESTIC');
    expect(channelFilter('DOMESTIC', 'contract-1')).toBeUndefined();
    expect(channelFilter(undefined)).toBeUndefined();
  });
});
