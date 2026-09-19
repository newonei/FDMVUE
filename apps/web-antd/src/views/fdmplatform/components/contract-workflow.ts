import type { Contract } from '#/api/fdmplatform';

/** UI guidance only. The existing server action remains the authoritative check. */
export function contractQuickActionReason(
  contract: Contract | undefined,
  action: string | undefined,
): string | undefined {
  if (!contract) return '合同尚未加载，请先保存或刷新合同';
  if (['CANCELLED', 'CLOSED'].includes(contract.status))
    return '合同已结案或取消，仅可查看历史单据';
  if (contract.blockReasons?.length)
    return `请先补齐办理资料：${contract.blockReasons.join('；')}`;
  if (!action) return '请从更多业务中选择具体办理事项';
  if (
    [
      'ASSIGN_FULFILLMENT',
      'CREATE_QUOTE',
      'CREATE_REQUEST',
      'GENERATE_ORDERS',
      'SAVE_PLAN',
      'STOCK_RESERVE',
      'STOCK_SHIP',
      'UPDATE_PRODUCTION',
    ].includes(action) &&
    !['CONFIRMED', 'EXECUTING'].includes(contract.status)
  )
    return '请先完成订单生效，再开展采购、生产或发货';
  if (
    ['CREATE_COST', 'CREATE_INVOICE', 'CREATE_RECEIPT'].includes(action) &&
    (contract.pricingComplete === false ||
      contract.items.some(
        (item) =>
          item.unitPrice === null ||
          item.unitPrice === undefined ||
          item.unitPrice === '',
      ))
  )
    return '合同尚有待定价产品，请先补齐成交单价';
  if (!contract.allowedActions.includes(action))
    return '当前合同状态或权限不支持此操作，请刷新合同后核对';
  return undefined;
}
