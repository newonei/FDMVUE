export type SlipItem = {
  label: string;
  note?: null | string;
} & ({ text: string; value?: null } | { text?: null; value: number });

export interface SlipSection {
  title: string;
  total?: null | number;
  items: SlipItem[];
}

export interface PayrollSlip {
  month: string;
  name: string;
  department: string;
  company: string;
  net?: null | number;
  sections: SlipSection[];
}

export type SlipResult =
  | { remainingMs: number; slip: PayrollSlip; status: 'AVAILABLE' }
  | { status: 'EXPIRED' };

const period = /^\d{4}-(0[1-9]|1[0-2])$/;
const identifier = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const money = new Intl.NumberFormat('zh-CN', {
  currency: 'CNY',
  style: 'currency',
});

export function parseSlipId(search: string) {
  const ids = new URLSearchParams(search).getAll('id');
  const [id] = ids;
  return ids.length === 1 && id && identifier.test(id)
    ? id.toLowerCase()
    : undefined;
}

export function formatAmount(cents: number) {
  return money
    .format(cents / 100)
    .replace('CN¥', '¥')
    .replace('￥', '¥');
}

export function formatMonth(value: string) {
  const [year, month] = value.split('-');
  return `${year}年${Number(month)}月`;
}

export function formatCountdown(remainingMs: number) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `剩余 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function parseSlipResult(
  data: unknown,
  responseDate: null | string,
  now = Date.now(),
): SlipResult {
  const payload = data as null | {
    expiresAt?: number;
    serverNow?: number;
    slip?: PayrollSlip;
    status?: string;
  };
  if (payload?.status === 'EXPIRED') return { status: 'EXPIRED' };
  if (payload?.status !== 'AVAILABLE' || !isInteger(payload.expiresAt))
    throw new Error('工资条响应格式不正确');

  // Prefer the service clock. HTTP Date keeps older responses usable on devices
  // whose clock differs from the server's clock.
  const httpTime = Date.parse(responseDate || '');
  let serverTime = Number.isFinite(httpTime) ? httpTime : now;
  if (isInteger(payload.serverNow)) serverTime = payload.serverNow;
  const remainingMs = payload.expiresAt - serverTime;
  if (remainingMs <= 0) return { status: 'EXPIRED' };

  const slip = payload.slip;
  if (
    !slip ||
    typeof slip.month !== 'string' ||
    !period.test(slip.month) ||
    typeof slip.name !== 'string' ||
    typeof slip.department !== 'string' ||
    typeof slip.company !== 'string' ||
    !isOptionalAmount(slip.net) ||
    !Array.isArray(slip.sections) ||
    !slip.sections.every(
      (section) =>
        section &&
        typeof section.title === 'string' &&
        isOptionalAmount(section.total) &&
        Array.isArray(section.items) &&
        section.items.every(
          (item) =>
            item &&
            typeof item.label === 'string' &&
            (typeof item.text === 'string'
              ? item.value === null || item.value === undefined
              : (item.text === null || item.text === undefined) &&
                isInteger(item.value)) &&
            (item.note === null ||
              item.note === undefined ||
              typeof item.note === 'string'),
        ),
    )
  )
    throw new Error('工资条响应格式不正确');
  return { status: 'AVAILABLE', remainingMs, slip };
}

function isInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isOptionalAmount(value: unknown) {
  return value === null || value === undefined || isInteger(value);
}
