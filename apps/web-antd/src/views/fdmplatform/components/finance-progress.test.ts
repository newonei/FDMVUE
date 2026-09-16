import { describe, expect, it } from 'vitest';

import {
  invoiceFinanceDescription,
  receiptFinanceDescription,
  receiptStatusDescription,
} from './finance-progress';

const money = (value: unknown, currency: unknown) => `${currency} ${value}`;
const summary = {
  complete: true,
  issues: [],
  pendingReceipts: '100',
  confirmedReceipts: '0',
  boundAmount: '0',
  unpaidAmount: '1000',
  overpaidAmount: '0',
  effectiveInvoices: '1000',
  unboundInvoiceAmount: '1000',
};

describe('contract finance display semantics', () => {
  it('separates pending, confirmed, invoice allocation and unpaid amounts', () => {
    const actual = receiptFinanceDescription(summary, 'USD', money);
    expect(actual).toContain('待确认金额：USD 100');
    expect(actual).toContain('已确认净回款：USD 0');
    expect(actual).toContain('已核销发票金额：USD 0');
    expect(actual).toContain('合同未回款：USD 1000');
  });
  it('keeps confirmed but unallocated funds distinct from unpaid amount', () => {
    const actual = receiptFinanceDescription(
      {
        ...summary,
        confirmedReceipts: '1000',
        pendingReceipts: '0',
        unpaidAmount: '0',
      },
      'USD',
      money,
    );
    expect(actual).toContain('已确认净回款：USD 1000');
    expect(actual).toContain('已核销发票金额：USD 0');
    expect(actual).toContain('合同未回款：USD 0');
  });
  it('displays unknown instead of fabricating zero on missing or incomplete data', () => {
    expect(receiptFinanceDescription(undefined, 'USD', money)).toContain(
      '未读取或当前不可见',
    );
    expect(
      receiptFinanceDescription({ ...summary, complete: false }, 'USD', money),
    ).not.toContain('USD');
    expect(
      receiptFinanceDescription(
        { ...summary, issues: ['UNVERIFIED'] },
        'USD',
        money,
      ),
    ).not.toContain('USD');
  });
  it.each([null, undefined, '', 'NaN', true, {}, Infinity])(
    'rejects invalid ledger scalar %s',
    (confirmedReceipts) => {
      expect(
        receiptFinanceDescription(
          { ...summary, confirmedReceipts },
          'USD',
          money,
        ),
      ).toContain('已确认净回款：待核对');
    },
  );
  it('keeps invoice balances and record status counts separate', () => {
    expect(invoiceFinanceDescription(summary, 'USD', money)).toContain(
      '发票未核销金额：USD 1000',
    );
    expect(
      receiptStatusDescription({
        total: 3,
        pending: 1,
        confirmed: 1,
        other: 1,
        statusBreakdownAvailable: true,
      }),
    ).toContain('其他待核对 1 笔');
  });
  it('supports rolling deployment without inventing zero categories', () => {
    expect(receiptStatusDescription({ total: 3 })).toContain('未读取');
    expect(
      receiptStatusDescription({ total: 0, statusBreakdownAvailable: false }),
    ).toContain('不可见');
    expect(
      receiptStatusDescription({
        total: 3,
        pending: 1,
        confirmed: 1,
        other: 0,
        statusBreakdownAvailable: true,
      }),
    ).toBe('状态统计待核对');
  });
});
