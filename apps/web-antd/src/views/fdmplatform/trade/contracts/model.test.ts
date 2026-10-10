import type {
  ContractBoardOverview,
  ContractBoardRow,
} from '#/api/fdmplatform/contract-board';

import { describe, expect, it } from 'vitest';

import {
  contractCsv,
  currencyLine,
  dueText,
  entryFromQuery,
  flowCounts,
  productText,
  progressText,
  quantityText,
  receiptBar,
  rowNext,
  stepTones,
  yearRange,
} from './model';

function row(overrides: Partial<ContractBoardRow> = {}): ContractBoardRow {
  return {
    id: 'c1',
    code: 'HT-20260909-000002',
    name: 'YJY5420260909-1Y',
    status: 'EXECUTING',
    stage: 'PURCHASE',
    waiting: 'QUOTE',
    tab: 'ACTIVE',
    customerId: 'cust',
    customerName: 'Koreasports Co., Ltd',
    companyId: 12,
    ownerUserId: 237,
    productCategory: 'YOGA',
    sample: false,
    currency: 'USD',
    amount: 3540,
    signedDate: '2026-09-09',
    migrated: false,
    pendingCompletion: false,
    itemCount: 1,
    firstItem: 'TPE双色瑜伽垫-Koreasports',
    unit: '条',
    quantities: {
      quantity: 1000,
      requested: 1000,
      ordered: 0,
      received: 0,
      shipped: 0,
    },
    shipState: 'NONE',
    dueDate: '2026-09-25',
    dueDays: -14,
    dueBucket: 'OVERDUE',
    buyers: [1],
    money: {
      known: true,
      confirmed: 0,
      pending: 3540,
      unpaid: 3540,
      invoiced: 0,
    },
    steps: ['DONE', 'ACTIVE', 'WAITING', 'WAITING', 'WAITING', 'WAITING'],
    counts: {
      requests: 1,
      quotes: 0,
      orders: 0,
      shipments: 0,
      receipts: 1,
      invoices: 0,
      attachments: 0,
    },
    ...overrides,
  };
}

describe('contract board model', () => {
  it('says what the contract waits for and who handles it', () => {
    expect(progressText(row(), () => 'Owen')).toBe('采购 · 等报价（Owen）');
    expect(progressText(row({ waiting: 'CLAIM' }), () => 'Owen')).toBe(
      '采购 · 等采购接单',
    );
    expect(progressText(row({ stage: 'DRAFT' }))).toBe('合同 · 草稿未生效');
    expect(
      progressText(
        row({
          stage: 'SHIP',
          quantities: { ...row().quantities, shipped: 400 },
        }),
      ),
    ).toBe('发货 · 已发 400/1,000');
    expect(
      progressText(
        row({
          stage: 'RECEIPT',
          money: { known: true, confirmed: 1062, pending: 0, unpaid: 2478 },
        }),
      ),
    ).toBe('回款 · 已收 30%');
  });

  it('paints the current step red only when the delivery date has passed', () => {
    expect(stepTones(row())).toEqual([
      'done',
      'late',
      'none',
      'none',
      'none',
      'none',
    ]);
    expect(stepTones(row({ dueBucket: undefined }))).toEqual([
      'done',
      'active',
      'none',
      'none',
      'none',
      'none',
    ]);
    expect(
      stepTones(
        row({
          steps: [
            'DONE',
            'UNKNOWN',
            'WAITING',
            'WAITING',
            'WAITING',
            'WAITING',
          ],
        }),
      )[1],
    ).toBe('unknown');
  });

  it('counts down delivery dates and hides them once everything shipped', () => {
    expect(dueText(row())).toEqual({
      main: '09-25',
      sub: '已过 14 天',
      tone: 'late',
    });
    expect(dueText(row({ dueDays: 3 })).sub).toBe('还剩 3 天');
    expect(dueText(row({ dueDate: null })).main).toBe('未约定');
    expect(dueText(row({ shipState: 'ALL' })).main).toBe('已发齐');
  });

  it('splits receipts into confirmed and waiting for finance', () => {
    expect(receiptBar(row())).toEqual({
      paid: 0,
      pending: 100,
      text: '已登记 3,540 待财务确认',
    });
    expect(
      receiptBar(
        row({ money: { known: true, confirmed: 3540, pending: 0, unpaid: 0 } }),
      ).text,
    ).toBe('已收齐');
    expect(
      receiptBar(row({ money: { known: false }, migrated: true })).text,
    ).toBe('回款待核对');
  });

  it('offers an action button only when it is the sales team’s turn', () => {
    expect(rowNext(row())).toEqual({ label: '查看', primary: false });
    expect(rowNext(row({ stage: 'DRAFT' }))).toEqual({
      label: '生效',
      primary: true,
    });
    expect(rowNext(row({ stage: 'REQUEST' })).label).toBe('提采购申请');
    expect(rowNext(row({ stage: 'RECEIPT' })).label).toBe('登记回款');
    expect(rowNext(row({ pendingCompletion: true })).label).toBe('补齐资料');
  });

  it('summarises products and money per currency', () => {
    expect(productText(row({ itemCount: 3 }))).toBe(
      'TPE双色瑜伽垫-Koreasports 等 3 项',
    );
    expect(quantityText(row({ itemCount: 3 }))).toBe('共 1,000 条');
    expect(
      currencyLine([
        { currency: 'CNY', amount: 73_065 },
        { currency: null, amount: 2700 },
      ]),
    ).toBe('CNY 73,065 · 2,700（币种未注明）');
    expect(currencyLine([], '已全部收齐')).toBe('已全部收齐');
  });

  it('maps portal entry links to tabs, stages and scope', () => {
    expect(entryFromQuery({ mine: 'true', status: 'DRAFT' })).toEqual({
      tab: 'ACTIVE',
      stage: 'DRAFT',
      due: undefined,
      mine: true,
    });
    expect(entryFromQuery({ scope: 'pending' }).tab).toBe('JINZHI');
    expect(entryFromQuery({ stage: 'SHIP', due: 'OVERDUE' })).toMatchObject({
      stage: 'SHIP',
      due: 'OVERDUE',
    });
    expect(entryFromQuery({ stage: 'BOGUS' }).stage).toBeUndefined();
  });

  it('turns jinzhi year shortcuts into signing date ranges', () => {
    expect(yearRange('ALL')).toEqual({});
    expect(yearRange(2026)).toEqual({
      signedFrom: '2026-01-01',
      signedTo: '2026-12-31',
    });
    expect(yearRange('EARLIER')).toEqual({ signedTo: '2024-12-31' });
  });

  it('shows the check stage only when some contracts need checking', () => {
    const overview = {
      stages: {
        DRAFT: 1,
        REQUEST: 0,
        PURCHASE: 4,
        SHIP: 0,
        RECEIPT: 0,
        INVOICE: 0,
        DONE: 0,
        CHECK: 0,
      },
    } as unknown as ContractBoardOverview;
    expect(flowCounts(overview).map((entry) => entry.key)).not.toContain(
      'CHECK',
    );
    overview.stages.CHECK = 2;
    expect(flowCounts(overview).at(-1)).toMatchObject({
      key: 'CHECK',
      count: 2,
    });
  });

  it('exports a quoted CSV with a BOM', () => {
    const csv = contractCsv(
      [row({ name: '含,逗号' })],
      () => '陈若彤 · 月迦部',
    );
    expect(csv.startsWith('﻿合同号,')).toBe(true);
    expect(csv).toContain('"含,逗号"');
    expect(csv).toContain('陈若彤 · 月迦部');
  });
});
