import type { DocumentKind } from './model';
import type { RelatedCreation } from './related-creation';

import type { DocumentRow } from '#/api/fdmplatform';

import BigNumber from 'bignumber.js';

import { rows } from '../data';
import { relatedCreations } from './related-creation';

export interface DocumentListAction extends RelatedCreation {
  related: boolean;
}
export interface DocumentListNextStep {
  action?: DocumentListAction;
  hint?: string;
}

/** The list offers a shortcut; DocumentAction reloads and validates the complete contract. */
export function documentListNextStep(
  kind: DocumentKind,
  row: DocumentRow,
): DocumentListNextStep {
  if (row.standaloneId) return { hint: row.blockReasons?.[0] };
  if (row.blockReasons?.length) return { hint: row.blockReasons[0] };
  const record = row.record;
  const status = String(record.status ?? '');
  if (['CANCELLED', 'CLOSED', 'VOID'].includes(status))
    return { hint: '单据已结束，可查看详情与记录' };
  const own = (action: string, title: string): DocumentListNextStep =>
    row.allowedActions?.includes(action)
      ? { action: { kind, action, title, related: false } }
      : { hint: '当前状态暂无可快捷办理的操作' };
  const related = (action: string): DocumentListNextStep => {
    const launch = relatedCreations(kind, record).find(
      (entry) => entry.action === action,
    );
    return launch && row.allowedActions?.includes(action)
      ? { action: { ...launch, related: true } }
      : { hint: '请查看详情核对前置业务与当前状态' };
  };
  switch (kind) {
    case 'arrivals': {
      return ['accepted', 'exception'].some((type) =>
        new BigNumber(String(record[`${type}Quantity`] ?? 0))
          .minus(
            String(
              record[
                `returned${type === 'accepted' ? 'Accepted' : 'Exception'}Quantity`
              ] ?? 0,
            ),
          )
          .isGreaterThan(0),
      )
        ? related('RETURN_ARRIVAL')
        : { hint: '本次到货已无可退数量' };
    }
    case 'orders': {
      return rows(record.lines).some((line) =>
        new BigNumber(String(line.quantity ?? 0))
          .minus(String(line.arrivedQuantity ?? 0))
          .plus(String(line.returnedQuantity ?? 0))
          .minus(String(line.cancelledQuantity ?? 0))
          .isGreaterThan(0),
      )
        ? related('RECORD_ARRIVAL')
        : { hint: '无待到货数量，可查看到货和退货记录' };
    }
    case 'plans': {
      if (['DRAFT', 'REJECTED', 'RETURNED', 'SUBMITTED'].includes(status))
        return own('SUBMIT_PLAN', '方案生效');
      if (['APPROVED', 'PARTIALLY_APPROVED'].includes(status))
        return related('GENERATE_ORDERS');
      return { hint: '请查看方案当前执行进度' };
    }
    case 'production': {
      return own('UPDATE_PRODUCTION', '更新自产进度');
    }
    case 'quotes': {
      return related('SAVE_PLAN');
    }
    case 'receipts': {
      return status === 'PENDING'
        ? own('CONFIRM_RECEIPT', '确认回款')
        : {
            hint:
              status === 'CONFIRMED'
                ? '已确认，可在详情核销或登记退款'
                : undefined,
          };
    }
    case 'requests': {
      return record.assignmentStatus === 'ASSIGNED'
        ? { hint: '已全部分派，可查看履约进度' }
        : related('ASSIGN_FULFILLMENT');
    }
    case 'tasks': {
      return record.method === 'BUY'
        ? related('CREATE_QUOTE')
        : related('SAVE_PLAN');
    }
    default: {
      return {};
    }
  }
}
