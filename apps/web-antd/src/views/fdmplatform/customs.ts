export const customsStatuses = [
  { value: 'DRAFT', label: '待安排' },
  { value: 'PROCESSING', label: '办理中' },
  { value: 'SUBMITTED', label: '已提交' },
  { value: 'SUPPLEMENTING', label: '补料中' },
  { value: 'RELEASED', label: '已放行 / 办理完成' },
  { value: 'ARCHIVED', label: '已归档' },
  { value: 'NOT_REQUIRED', label: '不需报关' },
  { value: 'CANCELLED', label: '已取消' },
];
export const customsCategories = [
  { value: 'CONTRACT', label: '合同及商品资料' },
  { value: 'COMMERCIAL_INVOICE', label: '商业发票' },
  { value: 'PACKING_LIST', label: '装箱单' },
  { value: 'DECLARATION', label: '委托及申报资料' },
  { value: 'TRANSPORT', label: '运输资料' },
  { value: 'RELEASE', label: '回执与放行资料' },
  { value: 'SUPPLEMENT', label: '补充资料' },
  { value: 'COST_EVIDENCE', label: '报关与运输费用凭据' },
];
export function customsLabel(value: unknown) {
  const labels: Record<string, string> = {
    PREPARING: '待准备',
    MISSING: '缺资料',
    PENDING_REVIEW: '待完善资料',
    REVIEW_PENDING: '待完善资料',
    READY: '资料齐全',
    COMPLETE: '资料齐全',
    INCOMPLETE: '缺资料',
    PENDING: '待处理',
    RESOLVED: '已处理',
    UPDATE: '更新批次',
    ASSIGN: '分派 / 转派',
    PROGRESS: '登记进度',
    CHECKLIST: '设置资料要求',
    FEEDBACK: '反馈缺件',
    RESOLVE_FEEDBACK: '完成反馈',
    CANCEL: '取消批次',
    ATTACHMENT_UPLOAD: '上传资料',
    COST_REFERENCE: '关联费用凭据',
    CREATE: '建立批次',
    SUBMIT_COST: '提交报关 / 运输费用',
    REGISTER_COST: '确认归集费用',
    REOPEN: '更正已完成批次',
    REGISTERED: '已归集',
    REJECTED: '已退回',
    TRANSPORT: '运输 / 报关',
  };
  const text = String(value ?? '');
  return (
    [...customsStatuses, ...customsCategories].find(
      (item) => item.value === text,
    )?.label ??
    labels[text] ??
    (text || '—')
  );
}
