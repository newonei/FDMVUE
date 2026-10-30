import type { ContractBoardQuery } from '#/api/fdmplatform/contract-board';

/** 合同列表自定义筛选：同一项多选为“任一”，各项之间“同时满足”；可保存为常用筛选 */
export interface ContractFilters {
  owners: number[];
  companies: number[];
  categories: string[];
  customers: Array<{ id: string; name: string }>;
  buyers: number[];
  shipStates: Array<'ALL' | 'NONE' | 'PARTIAL' | 'UNKNOWN'>;
  signed?: [string, string];
  due?: [string, string];
  amountMin?: number;
  amountMax?: number;
  /** SAMPLE 只看样品单 · FORMAL 只看正式合同 */
  kind?: 'FORMAL' | 'SAMPLE';
  unpaid?: boolean;
}

export interface ContractFilterPreset {
  name: string;
  filters: ContractFilters;
}

export const shipStateOptions = [
  { value: 'NONE', label: '未发货' },
  { value: 'PARTIAL', label: '部分发货' },
  { value: 'ALL', label: '已发齐' },
  { value: 'UNKNOWN', label: '待核对' },
] as const;

export function emptyFilters(): ContractFilters {
  return {
    owners: [],
    companies: [],
    categories: [],
    customers: [],
    buyers: [],
    shipStates: [],
  };
}

const join = (values: Array<number | string>) =>
  values.length > 0 ? values.join(',') : undefined;
const amount = (value?: null | number) =>
  value === null || value === undefined || Number.isNaN(value)
    ? undefined
    : value;

/** 列表接口参数；多选用逗号拼接，后端按 List 接收 */
export function filterQuery(
  filters: ContractFilters,
  mine: boolean,
): Partial<ContractBoardQuery> {
  return {
    ownerUserIds: mine ? undefined : join(filters.owners),
    companyIds: join(filters.companies),
    productCategories: join(filters.categories),
    customerIds: join(filters.customers.map((item) => item.id)),
    buyerUserIds: join(filters.buyers),
    shipStates: join(filters.shipStates),
    signedFrom: filters.signed?.[0],
    signedTo: filters.signed?.[1],
    dueFrom: filters.due?.[0],
    dueTo: filters.due?.[1],
    amountMin: amount(filters.amountMin),
    amountMax: amount(filters.amountMax),
    sample: filters.kind ? filters.kind === 'SAMPLE' : undefined,
    unpaid: filters.unpaid || undefined,
  };
}

/** 生效的筛选项个数（“我负责的”时不算负责人），用于按钮角标和是否显示“清除筛选” */
export function activeFilterCount(filters: ContractFilters, mine = false) {
  return [
    !mine && filters.owners.length > 0,
    filters.companies.length > 0,
    filters.categories.length > 0,
    filters.customers.length > 0,
    filters.buyers.length > 0,
    filters.shipStates.length > 0,
    !!filters.signed,
    !!filters.due,
    amount(filters.amountMin) !== undefined ||
      amount(filters.amountMax) !== undefined,
    !!filters.kind,
    !!filters.unpaid,
  ].filter(Boolean).length;
}

/** 补齐缺失字段，旧版本或手改过的存档也能安全读回 */
export function normalizeFilters(value: unknown): ContractFilters {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<
    string,
    unknown
  >;
  const numbers = (input: unknown) =>
    Array.isArray(input)
      ? input.filter((item): item is number => typeof item === 'number')
      : [];
  const strings = (input: unknown) =>
    Array.isArray(input)
      ? input.filter((item): item is string => typeof item === 'string')
      : [];
  const range = (input: unknown): [string, string] | undefined =>
    Array.isArray(input) &&
    input.length === 2 &&
    input.every((item) => typeof item === 'string' && item)
      ? [input[0], input[1]]
      : undefined;
  const states = new Set<string>(shipStateOptions.map((item) => item.value));
  return {
    owners: numbers(raw.owners),
    companies: numbers(raw.companies),
    categories: strings(raw.categories),
    customers: Array.isArray(raw.customers)
      ? raw.customers
          .filter(
            (item): item is { id: string; name: string } =>
              !!item &&
              typeof item.id === 'string' &&
              typeof item.name === 'string',
          )
          .map(({ id, name }) => ({ id, name }))
      : [],
    buyers: numbers(raw.buyers),
    shipStates: strings(raw.shipStates).filter((item) =>
      states.has(item),
    ) as ContractFilters['shipStates'],
    signed: range(raw.signed),
    due: range(raw.due),
    amountMin: typeof raw.amountMin === 'number' ? raw.amountMin : undefined,
    amountMax: typeof raw.amountMax === 'number' ? raw.amountMax : undefined,
    kind: raw.kind === 'SAMPLE' || raw.kind === 'FORMAL' ? raw.kind : undefined,
    unpaid: raw.unpaid === true || undefined,
  };
}

/** 深拷贝并补齐字段；Vue 响应式对象不能用 structuredClone */
export function cloneFilters(filters: ContractFilters): ContractFilters {
  return normalizeFilters(JSON.parse(JSON.stringify(filters)));
}

const PRESET_KEY = 'fdm.contracts.filters';
const presetKey = (channel: string, userId?: number) =>
  `${PRESET_KEY}.${channel}.${userId ?? ''}`;

/** 常用筛选只存在本机浏览器，按业务线和登录人分开 */
export function loadPresets(
  channel: string,
  userId?: number,
): ContractFilterPreset[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(presetKey(channel, userId)) ?? '[]',
    );
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (item) => item && typeof item.name === 'string' && item.name.trim(),
          )
          .map((item) => ({
            name: item.name.trim(),
            filters: normalizeFilters(item.filters),
          }))
      : [];
  } catch {
    return [];
  }
}

export function savePresets(
  channel: string,
  userId: number | undefined,
  presets: ContractFilterPreset[],
) {
  try {
    localStorage.setItem(presetKey(channel, userId), JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}

/** 同名覆盖，新的排最前 */
export function upsertPreset(
  presets: ContractFilterPreset[],
  name: string,
  filters: ContractFilters,
) {
  const trimmed = name.trim();
  return [
    { name: trimmed, filters: cloneFilters(filters) },
    ...presets.filter((item) => item.name !== trimmed),
  ];
}
