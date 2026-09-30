import { describe, expect, it } from 'vitest';

import {
  countryMatches,
  countrySelectOptions,
  customerActivityTypes,
  customerCsv,
  customerForm,
  customerMissingFields,
  customerRegion,
  customerSourceLabel,
  customerSourceOptions,
  mergeOkkiCustomers,
  moneyShort,
  recentTrend,
  signedAgo,
  sparkBars,
} from './model';

describe('oKKI customer preview and local maintenance', () => {
  it('preserves removed or historical source values without changing the configured dictionary', () => {
    const configured = ['展会', '其他'];
    expect(customerSourceOptions(configured, '历史进口商介绍')).toEqual([
      { label: '展会', value: '展会' },
      { label: '其他', value: '其他' },
      { label: '历史进口商介绍（原值）', value: '历史进口商介绍' },
    ]);
    expect(customerSourceOptions(configured, '展会')).toHaveLength(2);
    expect(configured).toEqual(['展会', '其他']);
  });
  it('flags contact and delivery gaps without demanding both email and phone', () => {
    expect(
      customerMissingFields({ email: 'buyer@example.com', address: '   ' }),
    ).toEqual(['国家 / 地区', '客户来源', '公司名称', '联系人', '详细地址']);
    expect(
      customerMissingFields({
        country: 'PL',
        phone: '+48 123',
        customerSource: '展会',
        companyName: 'Buyer Ltd',
        contactName: 'Buyer',
        address: 'Address',
      }),
    ).toEqual([]);
    expect(customerMissingFields({ email: ' ', phone: '' })).toContain(
      '邮箱或电话',
    );
  });
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

describe('客户档案', () => {
  it('单据类型按销售、收款、采购、仓储排列并使用统一中文名', () => {
    const labels = customerActivityTypes.map((item) => item.label);
    expect(labels.slice(0, 6)).toEqual([
      '合同订单',
      '发货单',
      '销售退货',
      '回款记录',
      '退款记录',
      '开票记录',
    ]);
    expect(new Set(customerActivityTypes.map((item) => item.value)).size).toBe(
      customerActivityTypes.length,
    );
  });
  it('地区与资料来源显示为可读文字', () => {
    expect(
      customerRegion({ countryName: '美国', country: 'US', city: 'LA' }),
    ).toBe('美国 / LA');
    expect(customerRegion({ country: 'US' })).toBe('US');
    expect(customerRegion({})).toBe('');
    expect(customerSourceLabel('JINZHI')).toBe('金智导入');
    expect(customerSourceLabel('OTHER')).toBe('OTHER');
    expect(customerSourceLabel()).toBe('—');
  });
});

describe('客户经营统计展示', () => {
  it('金额满一万显示为万，有币种时带币种，空值显示破折号', () => {
    expect(moneyShort(54_191_936)).toBe('5,419.2 万');
    expect(moneyShort('80130', 'CNY')).toBe('CNY 8.0 万');
    expect(moneyShort(3540.456)).toBe('3,540.46');
    expect(moneyShort(0)).toBe('0');
    expect(moneyShort(null)).toBe('—');
    expect(moneyShort('abc')).toBe('—');
  });
  it('距上次签约的时间用天、月、年描述', () => {
    expect(signedAgo(0)).toBe('今天签约');
    expect(signedAgo(24)).toBe('24 天前签约');
    expect(signedAgo(112)).toBe('3 个月前签约');
    expect(signedAgo(698)).toBe('1 年 11 个月前签约');
    expect(signedAgo(365)).toBe('1 年前签约');
    expect(signedAgo(null)).toBe('暂无合同');
  });
  it('近 12 个月与之前 12 个月比较，区分新客户与回流客户', () => {
    const base = {
      contractCount: 3,
      tier: 'ACTIVE' as const,
      newThisYear: false,
      newRecent90: false,
    };
    expect(
      recentTrend({ ...base, recent12Amount: 150, previous12Amount: 100 }),
    ).toEqual({ text: '较上年 ▲50%', tone: 'up' });
    expect(
      recentTrend({ ...base, recent12Amount: 52, previous12Amount: 100 }),
    ).toEqual({ text: '较上年 ▼48%', tone: 'down' });
    expect(
      recentTrend({ ...base, recent12Amount: 0, previous12Amount: 100 }).text,
    ).toBe('近 12 个月无签约');
    expect(
      recentTrend(
        {
          ...base,
          firstSignedDate: '2026-08-21',
          recent12Amount: 10,
          previous12Amount: 0,
        },
        '2025-10',
      ).text,
    ).toBe('首单在近 12 个月');
    expect(
      recentTrend(
        {
          ...base,
          firstSignedDate: '2020-04-24',
          recent12Amount: 10,
          previous12Amount: 0,
        },
        '2025-10',
      ).text,
    ).toBe('上年同期无签约');
    expect(recentTrend({ ...base, contractCount: 0 }).text).toBe('暂无合同');
  });
  it('迷你柱按本客户最大月份等比，空月份画成细线', () => {
    const bars = sparkBars([0, 50, 100], ['2026-07', '2026-08', '2026-09']);
    expect(bars.map((bar) => bar.height)).toEqual([2, 12, 24]);
    expect(bars[0]).toMatchObject({ empty: true, month: '2026-07' });
    expect(sparkBars([1, 1000])[0]?.height).toBe(3);
  });
  it('导出 CSV 带 BOM，转义逗号与引号并防止公式注入', () => {
    const csv = customerCsv([
      {
        id: '1',
        type: 'CUSTOMER',
        companyId: 0,
        code: 'JZ-C-1',
        name: 'Acme, "Ltd"',
        sourceSystem: 'JINZHI',
        active: true,
        version: 1,
        contactName: '=cmd',
        stats: {
          contractCount: 2,
          tier: 'SLEEP',
          newThisYear: false,
          newRecent90: false,
          contractAmount: 100,
          receivable: 5,
          receivableSource: 'JINZHI',
        },
      },
    ]);
    expect(csv.startsWith('\uFEFF客户编号,客户名称')).toBe(true);
    const row = csv.split('\r\n')[1];
    expect(row).toContain('"Acme, ""Ltd"""');
    expect(row).toContain(",'=cmd,");
    expect(row).toContain(',沉睡,2,');
    expect(row).toContain(',未注明币种,100,');
  });
});
