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

/** OKKI searches scan a bounded number of remote pages. Continue without losing prior matches. */
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
