import type {
  CountryOption,
  Customer,
  CustomerActivityType,
  CustomerStats,
  CustomerTier,
  OkkiCustomerSource,
} from '#/api/fdmplatform/customers';

import BigNumber from 'bignumber.js';

import { activityLabel } from '../../products/activity-model';

export const customerFields = [
  ['name', '客户全称'],
  ['code', '客户编号'],
  ['shortName', '简称'],
  ['companyName', '公司名称'],
  ['customerSource', '客户来源'],
  ['country', '国家 / 地区'],
  ['province', '省 / 州'],
  ['city', '城市'],
  ['address', '详细地址'],
  ['website', '网站'],
  ['contactName', '联系人'],
  ['email', '邮箱'],
  ['phone', '联系电话'],
] as const;

export function customerForm(customer?: Partial<Customer>) {
  return Object.fromEntries(
    customerFields.map(([key]) => [key, String(customer?.[key] ?? '')]),
  );
}

export function customerSourceOptions(values: string[], current = '') {
  const options = values.map((value) => ({ label: value, value }));
  if (current && !values.includes(current))
    options.push({ label: `${current}（原值）`, value: current });
  return options;
}

export function customerMissingFields(
  customer: Partial<Record<string, unknown>>,
) {
  const missing: string[] = [];
  const empty = (key: string) => !String(customer[key] ?? '').trim();
  if (empty('country')) missing.push('国家 / 地区');
  if (empty('customerSource')) missing.push('客户来源');
  if (empty('companyName')) missing.push('公司名称');
  if (empty('contactName')) missing.push('联系人');
  if (empty('email') && empty('phone')) missing.push('邮箱或电话');
  if (empty('address')) missing.push('详细地址');
  return missing;
}

export function countrySelectOptions(countries: CountryOption[]) {
  return countries.map((country) => ({
    value: country.code,
    label: `${country.nameZh} · ${country.nameEn} (${country.code})`,
    search:
      `${country.nameZh} ${country.nameEn} ${country.code} ${country.iso3} ${(country.aliases ?? []).join(' ')}`.toLocaleLowerCase(),
  }));
}

export function countryMatches(input: string, option?: unknown) {
  return Boolean(
    option &&
    typeof option === 'object' &&
    'search' in option &&
    typeof option.search === 'string' &&
    option.search.includes(input.trim().toLocaleLowerCase()),
  );
}

/** Merge local directory result pages without losing matches or duplicating a customer. */
export function mergeOkkiCustomers(
  current: OkkiCustomerSource[],
  next: OkkiCustomerSource[],
) {
  return [
    ...new Map(
      [...current, ...next].map((customer) => [customer.externalId, customer]),
    ).values(),
  ];
}

/** 客户档案的单据类型，按外贸业务顺序：销售与收款在前，采购与仓储在后 */
export const customerActivityTypes: {
  label: string;
  value: Exclude<CustomerActivityType, 'ALL'>;
}[] = (
  [
    'CONTRACT',
    'SHIPMENT',
    'SALES_RETURN',
    'RECEIPT',
    'REFUND',
    'SALES_INVOICE',
    'CUSTOMS',
    'PURCHASE_REQUEST',
    'ASSIGNMENT',
    'QUOTE',
    'PURCHASE_PLAN',
    'PURCHASE_ORDER',
    'ARRIVAL',
    'PURCHASE_RETURN',
    'PRODUCTION_PROGRESS',
    'STOCK_IN',
    'STOCK_OUT',
    'PURCHASE_INVOICE',
    'PURCHASE_PAYMENT',
  ] as const
).map((value) => ({ value, label: activityLabel(value) }));

export function customerRegion(customer: Partial<Customer>) {
  return [
    customer.countryName || customer.country,
    customer.province,
    customer.city,
  ]
    .filter(Boolean)
    .join(' / ');
}

export function customerSourceLabel(source?: string) {
  if (source === 'OKKI') return 'OKKI 同步';
  if (source === 'LOCAL') return '本地新增';
  if (source === 'JINZHI') return '金智导入';
  return source || '—';
}

export const customerTiers: Record<
  CustomerTier,
  { color: string; label: string }
> = {
  ACTIVE: { label: '活跃', color: 'blue' },
  FOLLOW: { label: '需跟进', color: 'orange' },
  SLEEP: { label: '沉睡', color: 'default' },
  NONE: { label: '未成交', color: 'default' },
};

function decimal(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (value === '') return undefined;
  const amount = new BigNumber(value);
  return amount.isFinite() ? amount : undefined;
}

/** 满一万显示为「万」保留一位小数；有币种时加币种代码，不猜测未注明的币种 */
export function moneyShort(value: unknown, currency?: null | string) {
  const amount = decimal(value);
  if (!amount) return '—';
  const text = amount.abs().isGreaterThanOrEqualTo(10_000)
    ? `${amount.dividedBy(10_000).toFormat(1, BigNumber.ROUND_HALF_UP)} 万`
    : amount.decimalPlaces(2, BigNumber.ROUND_HALF_UP).toFormat();
  return currency ? `${currency} ${text}` : text;
}

export function currencyLabel(currency?: null | string) {
  return currency || '未注明币种';
}

export function signedAgo(days?: null | number) {
  if (days === null || days === undefined) return '暂无合同';
  if (days <= 0) return '今天签约';
  if (days < 31) return `${days} 天前签约`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前签约`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return `${years} 年${months ? ` ${months} 个月` : ''}前签约`;
}

/** 近 12 个月与之前 12 个月比较；上年没有签约时说明是新客户还是回流 */
export function recentTrend(
  stats?: CustomerStats,
  /** 近 12 个月的第一个月（YYYY-MM），取自 overview.months[0] */
  firstMonth?: string,
): {
  text: string;
  tone: 'down' | 'muted' | 'up';
} {
  const recent = decimal(stats?.recent12Amount) ?? new BigNumber(0);
  const previous = decimal(stats?.previous12Amount) ?? new BigNumber(0);
  if (!stats?.contractCount) return { text: '暂无合同', tone: 'muted' };
  if (recent.isZero()) return { text: '近 12 个月无签约', tone: 'muted' };
  if (previous.isZero()) {
    let windowStart = firstMonth;
    if (!windowStart) {
      const start = new Date();
      start.setMonth(start.getMonth() - 11, 1);
      windowStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    }
    const started = (stats.firstSignedDate ?? '') >= windowStart;
    return {
      text: started ? '首单在近 12 个月' : '上年同期无签约',
      tone: 'muted',
    };
  }
  const change = recent
    .minus(previous)
    .dividedBy(previous)
    .multipliedBy(100)
    .integerValue(BigNumber.ROUND_HALF_UP);
  return change.isNegative()
    ? { text: `较上年 ▼${change.abs().toString()}%`, tone: 'down' }
    : { text: `较上年 ▲${change.toString()}%`, tone: 'up' };
}

/** 迷你柱：按本客户 12 个月内最大值等比，最小留 3px，无签约的月份画 2px 灰线 */
export function sparkBars(monthly: unknown[] = [], months: string[] = []) {
  const values = monthly.map((value) => decimal(value) ?? new BigNumber(0));
  const max = BigNumber.max(1, ...values);
  return values.map((value, index) => ({
    height: value.isGreaterThan(0)
      ? Math.max(3, Math.round(value.dividedBy(max).toNumber() * 24))
      : 2,
    empty: !value.isGreaterThan(0),
    month: months[index] ?? '',
    value,
  }));
}

export function receivableHint(source?: CustomerStats['receivableSource']) {
  if (source === 'JINZHI') return '金智汇总（截至迁移）';
  if (source === 'NATIVE') return '合同额 − 回款';
  if (source === 'MIXED') return '金智汇总 + 新系统合同';
  return '';
}

/** 导出当前筛选的客户：Excel 可直接打开的 UTF-8 CSV */
export function customerCsv(rows: Customer[]) {
  const header = [
    '客户编号',
    '客户名称',
    '简称',
    '资料来源',
    '国家 / 地区',
    '客户来源',
    '公司名称',
    '联系人',
    '邮箱',
    '电话',
    '状态',
    '分层',
    '合同数',
    '首次签约',
    '最近签约',
    '最近合同',
    '币种',
    '累计合同额',
    '近 12 个月合同额',
    '之前 12 个月合同额',
    '未回款',
    '未回款口径',
    '其他币种',
  ];
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    // 以 = + - @ 开头的文本加引号前缀，避免被表格软件当成公式执行
    const safe =
      typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  const lines = rows.map((row) => {
    const stats = row.stats;
    return [
      row.code,
      row.name,
      row.shortName,
      customerSourceLabel(row.sourceSystem),
      customerRegion(row),
      row.customerSource,
      row.companyName,
      row.contactName,
      row.email,
      row.phone,
      row.active ? '启用' : '停用',
      stats ? customerTiers[stats.tier].label : '',
      stats?.contractCount ?? '',
      stats?.firstSignedDate,
      stats?.lastSignedDate,
      stats?.lastContractCode,
      stats?.contractCount ? currencyLabel(stats.currency) : '',
      stats?.contractAmount,
      stats?.recent12Amount,
      stats?.previous12Amount,
      stats?.receivable,
      receivableHint(stats?.receivableSource),
      (stats?.otherCurrencies ?? [])
        .map(
          (item) =>
            `${currencyLabel(item.currency)} 合同 ${item.contractAmount} 未回款 ${item.receivable}`,
        )
        .join('；'),
    ]
      .map((value) => cell(value))
      .join(',');
  });
  return `\uFEFF${[header.join(','), ...lines].join('\r\n')}`;
}
