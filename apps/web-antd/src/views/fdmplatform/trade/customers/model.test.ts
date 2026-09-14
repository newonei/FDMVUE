import { describe, expect, it } from 'vitest';

import {
  countryMatches,
  countrySelectOptions,
  customerForm,
  mergeOkkiCustomers,
} from './model';

describe('oKKI customer preview and local maintenance', () => {
  it('searches the supplied fixed country list by Chinese, English, ISO2 and ISO3 without creating values', () => {
    const options = countrySelectOptions([
      { code: 'US', nameZh: '美国', nameEn: 'United States', iso3: 'USA' },
    ]);
    for (const input of ['美国', 'united', 'us', 'USA'])
      expect(countryMatches(input, options[0])).toBe(true);
    expect(countryMatches('未知国家', options[0])).toBe(false);
    expect(options.map((item) => item.value)).toEqual(['US']);
    const [uae] = countrySelectOptions([
      {
        code: 'AE',
        nameZh: '阿拉伯联合酋长国',
        nameEn: 'United Arab Emirates',
        iso3: 'ARE',
        aliases: ['阿联酋', 'UAE'],
      },
    ]);
    expect(countryMatches('阿联酋', uae)).toBe(true);
    expect(countryMatches('uae', uae)).toBe(true);
  });
  it('keeps remote IDs as exact strings while combining continued search results', () => {
    const first = { externalId: '9223372036854775806', name: '客户甲' };
    const second = { externalId: '9223372036854775807', name: '客户乙' };
    expect(
      mergeOkkiCustomers([first], [second, { ...first, name: '客户甲新名' }]),
    ).toEqual([{ ...first, name: '客户甲新名' }, second]);
    expect(first.name).toBe('客户甲');
  });
  it('prefills contact fields without using missing values as text or taking over source identity', () => {
    const form = customerForm({
      name: '客户甲',
      code: 'C-001',
      email: 'customer@example.com',
      externalId: 'remote-1',
      sourceSystem: 'OKKI',
    });
    expect(form).toMatchObject({
      name: '客户甲',
      code: 'C-001',
      email: 'customer@example.com',
      address: '',
    });
    expect(form).not.toHaveProperty('externalId');
    expect(form).not.toHaveProperty('sourceSystem');
    expect(customerForm().name).toBe('');
  });
});
