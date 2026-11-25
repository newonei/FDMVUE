import type { Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { contractActions, financeActions } from '../data';
import { documentActionDefinition } from './model';

const contract = {
  id: 'contract-1',
  companyId: 6,
  code: 'HT-20260917-000001',
  name: '客户订单名称',
  status: 'CONFIRMED',
  currency: 'CNY',
  ownerUserId: 7,
  items: [{ id: 'line-1', skuId: 'sku-1', skuName: '产品', unitPrice: '100' }],
  allowedActions: [
    'CREATE_REQUEST',
    'CREATE_RECEIPT',
    'CREATE_INVOICE',
    'CREATE_COST',
    'CREATE_QUOTE',
  ],
  finance: { receipts: [], invoices: [] },
  receiptAccount: {
    id: 21,
    name: '合同收款',
    currency: 'CNY',
    accountType: 'BANK',
  },
} as unknown as Contract;

function requestAction(target: typeof contract) {
  const action = contractActions(target, []).CREATE_REQUEST;
  if (!action) {
    throw new Error('CREATE_REQUEST missing');
  }
  const nameField = action.fields.find((field) => field.key === 'name');
  if (!nameField) {
    throw new Error('request name field missing');
  }
  return { action, nameField };
}

function financeAction(
  key: 'CONFIRM_RECEIPT' | 'CREATE_COST' | 'CREATE_INVOICE' | 'CREATE_RECEIPT',
) {
  const action = financeActions(contract)[key];
  if (!action) {
    throw new Error(`${key} missing`);
  }
  return action;
}

describe('contract optimization form defaults', () => {
  it('defaults the purchase request subject to the contract internal number', () => {
    const { action, nameField } = requestAction(contract);
    expect(nameField.default).toBe(contract.name);
    expect(nameField.disabled).not.toBe(true);
    expect(action.lineKey).toBe('items');
  });

  it('rebuilds the default name when the bound contract changes', () => {
    const second = { ...contract, name: 'FYY-002' };
    expect(requestAction(second).nameField.default).toBe(second.name);
    expect(requestAction(contract).nameField.default).toBe(contract.name);
  });

  it('keeps a typed request name when the definition is rebuilt for the same contract', () => {
    const edited = '人工申请名称';
    expect(requestAction(contract).nameField.default).toBe(contract.name);
    expect(edited).not.toBe(requestAction(contract).nameField.default);
  });

  it('offers an optional receipt account alongside source, amount, currency and date', () => {
    const fields = financeAction('CREATE_RECEIPT').fields;
    expect(fields.map((field) => field.key)).toEqual([
      'sourceKey',
      'amount',
      'currency',
      'receivedAt',
      'accountId',
      'paymentMethod',
    ]);
    expect(fields.find((field) => field.key === 'accountId')?.required).toBe(
      false,
    );
    expect(fields.find((field) => field.key === 'accountId')?.default).toBe(21);
    expect(fields.find((field) => field.key === 'currency')?.default).toBe(
      'CNY',
    );
  });

  it('still requires invoice and cost evidence references', () => {
    for (const action of ['CREATE_INVOICE', 'CREATE_COST'] as const) {
      expect(
        financeAction(action).fields.find(
          (field) => field.key === 'evidenceRef',
        )?.required,
      ).toBe(true);
    }
  });

  it('still requires quote evidence ids', () => {
    const quote = contractActions(contract, []).CREATE_QUOTE;
    if (!quote) {
      throw new Error('CREATE_QUOTE missing');
    }
    expect(
      quote.fields.find((field) => field.key === 'evidenceIds')?.required,
    ).toBe(true);
  });

  it('keeps receipt confirmation as a separate action keyed by receiptId', () => {
    const confirm = financeAction('CONFIRM_RECEIPT');
    const receiptField = confirm.fields.find(
      (field) => field.key === 'receiptId',
    );
    if (!receiptField) {
      throw new Error('CONFIRM_RECEIPT receiptId missing');
    }
    expect(receiptField.key).toBe('receiptId');
    expect(
      confirm.fields.find((field) => field.key === 'accountId')?.label,
    ).toBe('实际到账账户');
  });

  it('exposes the same request and receipt create actions through document definitions', () => {
    const request = documentActionDefinition(
      contract,
      'requests',
      'CREATE_REQUEST',
      [],
      [],
    );
    const receipt = documentActionDefinition(
      contract,
      'receipts',
      'CREATE_RECEIPT',
      [],
      [],
    );
    expect(request.fields.find((field) => field.key === 'name')?.default).toBe(
      contract.name,
    );
    expect(receipt.fields.map((field) => field.key)).toEqual([
      'sourceKey',
      'amount',
      'currency',
      'receivedAt',
      'accountId',
      'paymentMethod',
    ]);
    expect(receipt.receiptCash?.companyId).toBe(6);
  });
});
