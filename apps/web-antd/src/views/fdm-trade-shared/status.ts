import type { TradeStatusTone } from './components';

const STATUS_LABELS: Record<string, string> = {
  ACCEPTED: '已接收',
  AI_DRAFT: 'AI 草稿',
  APPROVED: '已审核',
  BLOCKED: '已阻断',
  BOOKING: '订舱中',
  CANCELLED: '已取消',
  COMPLETED: '已完成',
  CONFIRMED: '已确认',
  CUSTOMS_PREPARATION: '报关准备',
  CUSTOMS_RELEASED: '海关放行',
  DELIVERED: '已交付',
  DISABLED: '已停用',
  DRAFT: '草稿',
  FOLLOW_UP_PENDING: '待跟单',
  HIGH: '高风险',
  IN_PROGRESS: '执行中',
  IN_PRODUCTION: '生产中',
  INSPECTION: '验货中',
  LOW: '低风险',
  MEDIUM: '中风险',
  MISSING: '缺失',
  NOT_CHECKED: '待检查',
  PARTIALLY_RECEIVED: '部分入库',
  PARTIALLY_SHIPPED: '部分发货',
  PARTIALLY_SOURCED: '部分寻源',
  PAID: '已支付',
  PENDING: '待处理',
  PENDING_APPROVAL: '待审批',
  PENDING_VERIFICATION: '待验真',
  PRODUCTION: '生产 / 备货',
  READY: '已齐套',
  REVERSED: '已撤销',
  SAILED: '已开航',
  SOURCED: '已寻源',
  SUPPLIER_CONFIRMATION: '供应商确认',
  SYNCED: '已同步',
  VERIFIED: '已验真',
  VOID: '已作废',
};

const SUCCESS_STATUSES = new Set([
  'ACCEPTED',
  'APPROVED',
  'COMPLETED',
  'CONFIRMED',
  'CUSTOMS_RELEASED',
  'DELIVERED',
  'PAID',
  'READY',
  'SAILED',
  'SOURCED',
  'SYNCED',
  'VERIFIED',
]);

const DANGER_STATUSES = new Set([
  'BLOCKED',
  'CANCELLED',
  'DISABLED',
  'HIGH',
  'MISSING',
  'REVERSED',
  'VOID',
]);

const WARNING_STATUSES = new Set([
  'MEDIUM',
  'PARTIALLY_RECEIVED',
  'PARTIALLY_SHIPPED',
  'PARTIALLY_SOURCED',
  'PENDING_APPROVAL',
  'PENDING_VERIFICATION',
]);

const PROCESSING_STATUSES = new Set([
  'AI_DRAFT',
  'BOOKING',
  'CUSTOMS_PREPARATION',
  'FOLLOW_UP_PENDING',
  'IN_PRODUCTION',
  'IN_PROGRESS',
  'INSPECTION',
  'PRODUCTION',
]);

export function statusLabel(status?: string) {
  if (!status) return '—';
  return STATUS_LABELS[status] ?? status;
}

export function statusTone(status?: string): TradeStatusTone {
  if (!status) return 'default';
  if (SUCCESS_STATUSES.has(status)) return 'success';
  if (DANGER_STATUSES.has(status)) return 'danger';
  if (WARNING_STATUSES.has(status)) return 'warning';
  if (PROCESSING_STATUSES.has(status)) return 'processing';
  if (status === 'LOW') return 'info';
  return 'default';
}
