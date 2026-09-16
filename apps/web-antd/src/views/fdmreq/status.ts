import type { FdmReqStatus } from '#/api/fdmreq';

export const FDMREQ_STATUS_OPTIONS: Array<{
  label: string;
  value: FdmReqStatus;
}> = [
  { label: '待分析', value: 'PENDING_ANALYSIS' },
  { label: '待补充', value: 'PENDING_SUPPLEMENT' },
  { label: '方案待确认', value: 'PENDING_CONFIRM' },
  { label: '已授权待开发', value: 'APPROVED_PENDING_DEV' },
  { label: '开发中', value: 'DEVELOPING' },
  { label: '测试中', value: 'TESTING' },
  { label: '已推送检查中', value: 'PUSHED_CHECKING' },
  { label: '待活测', value: 'PENDING_ACCEPTANCE' },
  { label: '已完结', value: 'COMPLETED' },
  { label: '已完结', value: 'ACCEPTED' },
  { label: '已阻塞', value: 'BLOCKED' },
  { label: '已取消', value: 'CANCELLED' },
];

const STATUS_COLORS: Partial<Record<FdmReqStatus, string>> = {
  PENDING_CONFIRM: 'gold',
  APPROVED_PENDING_DEV: 'cyan',
  DEVELOPING: 'processing',
  TESTING: 'blue',
  PUSHED_CHECKING: 'purple',
  PENDING_ACCEPTANCE: 'orange',
  COMPLETED: 'success',
  ACCEPTED: 'success',
  BLOCKED: 'error',
  CANCELLED: 'default',
};

const STATUS_META: Record<string, { color: string; label: string }> =
  Object.fromEntries(
    FDMREQ_STATUS_OPTIONS.map((option) => [
      option.value,
      {
        color: STATUS_COLORS[option.value] ?? 'default',
        label: option.label,
      },
    ]),
  );

export function getFdmReqStatusMeta(status?: string) {
  return (
    STATUS_META[String(status ?? '')] ?? {
      color: 'default',
      label: status || '未知状态',
    }
  );
}

export function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0 ? value.join('、') : '无';
  const text = String(value ?? '').trim();
  return text || '无';
}
