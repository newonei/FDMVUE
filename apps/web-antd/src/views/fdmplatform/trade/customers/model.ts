import type {
  CountryOption,
  Customer,
  OkkiCustomerSource,
} from '#/api/fdmplatform/customers';

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
