import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { label, receiptStatusLabel } from '../data';
import {
  canCancelReceipt,
  documentActionDefinition,
  documentActionUnavailableReason,
  documentStatuses,
} from './model';
import { relatedCreations } from './related-creation';

const pending: BusinessRecord = {
  id: 'pending',
  kind: 'PAYMENT',
  status: 'PENDING',
  amount: '100',
  currency: 'CNY',
};
const confirmed = { ...pending, id: 'confirmed', status: 'CONFIRMED' };
const cancelled = { ...pending, id: 'cancelled', status: 'CANCELLED' };
const refund = {
  ...pending,
  id: 'refund',
  kind: 'REFUND',
  originalReceiptId: confirmed.id,
};
const contract = {
  id: 'c',
  currency: 'CNY',
  businessType: 'DOMESTIC',
  items: [],
  allowedActions: ['CANCEL_RECEIPT'],
  finance: { receipts: [pending, confirmed, cancelled, refund] },
} as unknown as Contract;

describe('receipt cancellation', () => {
  it('only offers cancellation for a pending original receipt with an allowed action', () => {
    expect(canCancelReceipt(pending, contract.allowedActions)).toBe(true);
    expect(canCancelReceipt(pending, [])).toBe(false);
    for (const record of [confirmed, cancelled, refund])
      expect(canCancelReceipt(record, contract.allowedActions)).toBe(false);
  });

  it('locks the selected receipt, requires a reason, and excludes other states from candidates', () => {
    const definition = documentActionDefinition(
      contract,
      'receipts',
      'CANCEL_RECEIPT',
      [],
      [],
      pending,
    );
    expect(definition.initialValues?.receiptId).toBe(pending.id);
    expect(
      definition.fields.find((field) => field.key === 'receiptId'),
    ).toMatchObject({
      disabled: true,
      options: [expect.objectContaining({ value: pending.id })],
    });
    expect(
      definition.fields.find((field) => field.key === 'reason'),
    ).toMatchObject({
      required: true,
      maxLength: 1000,
      type: 'textarea',
    });
    expect(() =>
      documentActionDefinition(
        contract,
        'receipts',
        'CANCEL_RECEIPT',
        [],
        [],
        confirmed,
      ),
    ).toThrow('仅可撤销');
    expect(() =>
      documentActionDefinition(
        contract,
        'receipts',
        'CANCEL_RECEIPT',
        [],
        [],
        cancelled,
      ),
    ).toThrow('仅可撤销');
  });

  it('keeps cancelled receipts out of confirmation, currency repair, allocation and refunds', () => {
    for (const action of [
      'CONFIRM_RECEIPT',
      'REFRESH_RECEIPT_FX',
      'REVERSE_RECEIPT',
    ]) {
      expect(documentActionUnavailableReason(contract, action, cancelled)).toBe(
        '回款登记已撤销，仅可查看历史记录',
      );
      expect(() =>
        documentActionDefinition(
          contract,
          'receipts',
          action,
          [],
          [],
          cancelled,
        ),
      ).toThrow('回款登记已撤销');
    }
    for (const record of [pending, cancelled])
      expect(relatedCreations('receipts', record)).toEqual([]);
    expect(
      relatedCreations('receipts', confirmed).map((entry) => entry.action),
    ).toEqual(['BIND_ALLOCATION', 'REVERSE_RECEIPT']);
    const repair = documentActionDefinition(
      contract,
      'receipts',
      'REFRESH_RECEIPT_FX',
      [],
      [],
    );
    expect(
      repair.fields
        .find((field) => field.key === 'receiptId')
        ?.options?.map((option) => option.value),
    ).not.toContain(cancelled.id);
  });

  it('labels the retained receipt as revoked without changing contract cancellation wording', () => {
    expect(documentStatuses('receipts')).toContain('CANCELLED');
    expect(receiptStatusLabel('CANCELLED')).toBe('已撤销');
    expect(label('CANCELLED')).toBe('已取消');
  });
});
