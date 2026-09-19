import type { DocumentRow } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { documentListNextStep } from './list-actions';

function row(
  record: Record<string, unknown>,
  allowedActions: string[],
): DocumentRow {
  return {
    id: 'row-a',
    contractId: 'contract-a',
    allowedActions,
    record: { id: 'row-a', ...record },
  } as DocumentRow;
}
describe('document list next steps', () => {
  it('opens a quote for external buying and a plan for internal production before approval', () => {
    expect(
      documentListNextStep('tasks', row({ method: 'BUY' }, ['CREATE_QUOTE']))
        .action,
    ).toMatchObject({ kind: 'quotes', action: 'CREATE_QUOTE', related: true });
    expect(
      documentListNextStep(
        'tasks',
        row({ method: 'MAKE' }, ['SAVE_PLAN', 'UPDATE_PRODUCTION']),
      ).action,
    ).toMatchObject({ kind: 'plans', action: 'SAVE_PLAN', related: true });
  });
  it('honors allowed actions and cancelled sources', () => {
    expect(
      documentListNextStep('tasks', row({ method: 'BUY' }, [])).action,
    ).toBeUndefined();
    expect(
      documentListNextStep(
        'tasks',
        row({ method: 'BUY', status: 'CANCELLED' }, ['CREATE_QUOTE']),
      ),
    ).toEqual({ hint: '单据已结束，可查看详情与记录' });
  });
  it('does not route imported standalone records into contract mutations', () => {
    const imported = {
      ...row({ method: 'BUY' }, ['CREATE_QUOTE']),
      standaloneId: 'native-a',
      blockReasons: ['请补齐来源关联'],
    };
    expect(documentListNextStep('tasks', imported)).toEqual({
      hint: '请补齐来源关联',
    });
  });
  it('does not offer another assignment for fully assigned requests', () => {
    expect(
      documentListNextStep(
        'requests',
        row({ assignmentStatus: 'ASSIGNED' }, ['ASSIGN_FULFILLMENT']),
      ).action,
    ).toBeUndefined();
    expect(
      documentListNextStep(
        'requests',
        row({ assignmentStatus: 'PARTIALLY_ASSIGNED' }, ['ASSIGN_FULFILLMENT']),
      ).action?.kind,
    ).toBe('tasks');
  });
  it.each([
    ['DRAFT', 'SUBMIT_PLAN', false],
    ['RETURNED', 'SUBMIT_PLAN', false],
    ['SUBMITTED', 'SUBMIT_PLAN', false],
    ['APPROVED', 'GENERATE_ORDERS', true],
  ])(
    'selects the form appropriate to plan state %s',
    (status, action, related) => {
      expect(
        documentListNextStep(
          'plans',
          row({ status }, ['SUBMIT_PLAN', 'DECIDE_PLAN', 'GENERATE_ORDERS']),
        ).action,
      ).toMatchObject({ action, related });
    },
  );
  it('calculates remaining arrival quantity with returned and cancelled amounts', () => {
    const record = row(
      {
        lines: [
          {
            quantity: '10',
            arrivedQuantity: '10',
            returnedQuantity: '2',
            cancelledQuantity: '1',
          },
        ],
      },
      ['RECORD_ARRIVAL'],
    );
    expect(documentListNextStep('orders', record).action?.action).toBe(
      'RECORD_ARRIVAL',
    );
    record.record.lines = [
      {
        quantity: '10',
        arrivedQuantity: '10',
        returnedQuantity: '2',
        cancelledQuantity: '2',
      },
    ];
    expect(documentListNextStep('orders', record).action).toBeUndefined();
  });
  it('only shows arrival returns while accepted or exceptional quantities remain', () => {
    const record = row(
      {
        acceptedQuantity: '5',
        returnedAcceptedQuantity: '5',
        exceptionQuantity: '2',
        returnedExceptionQuantity: '1',
      },
      ['RETURN_ARRIVAL'],
    );
    expect(documentListNextStep('arrivals', record).action?.action).toBe(
      'RETURN_ARRIVAL',
    );
    record.record.returnedExceptionQuantity = '2';
    expect(documentListNextStep('arrivals', record).action).toBeUndefined();
  });
  it('opens confirmation only for pending receipts without confirming anything', () => {
    expect(
      documentListNextStep(
        'receipts',
        row({ status: 'PENDING' }, ['CONFIRM_RECEIPT']),
      ).action,
    ).toMatchObject({
      action: 'CONFIRM_RECEIPT',
      kind: 'receipts',
      related: false,
    });
    expect(
      documentListNextStep(
        'receipts',
        row({ status: 'CONFIRMED' }, ['CONFIRM_RECEIPT']),
      ).action,
    ).toBeUndefined();
  });
});
