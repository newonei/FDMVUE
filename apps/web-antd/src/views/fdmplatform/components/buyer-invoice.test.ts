import type { Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { financeActions, invoiceTaxAmount } from '../data';

const contract = (businessType: string) =>
  ({
    id: 'c1',
    code: 'HT-1',
    customerId: 'customer-1',
    businessType,
    currency: 'CNY',
    items: [],
    finance: { receipts: [], invoices: [], allocations: [], costs: [] },
  }) as unknown as Contract;

describe('invoice registration shows the buyer invoice details', () => {
  it('points domestic contracts and domestic samples at their customer', () => {
    for (const type of ['DOMESTIC', 'DOMESTIC_SAMPLE'])
      expect(
        financeActions(contract(type)).CREATE_INVOICE?.buyerCustomerId,
      ).toBe('customer-1');
  });

  it('leaves foreign-trade invoices without a buyer panel', () => {
    for (const type of ['FOREIGN', 'SAMPLE', ''])
      expect(
        financeActions(contract(type)).CREATE_INVOICE?.buyerCustomerId,
      ).toBeUndefined();
  });
});

describe('domestic invoice record follows Jinzhi fields', () => {
  it('pre-fills content from the contract lines and leaves number and evidence optional', () => {
    const value = contract('DOMESTIC');
    value.items = [
      { skuName: '瑜伽垫', quantity: '2550', unit: '条', unitPrice: '26.1' },
      { skuName: '收纳袋', quantity: '10', unit: '个', unitPrice: null },
    ] as unknown as Contract['items'];
    const definition = financeActions(value).CREATE_INVOICE!;
    const field = (key: string) =>
      definition.fields.find((item) => item.key === key);
    expect(field('content')?.default).toBe(
      '瑜伽垫 2550条 66555.00元；收纳袋 10个',
    );
    expect(field('invoiceNumber')?.required).toBe(false);
    expect(field('evidenceRef')?.required).toBe(false);
    expect(field('taxRate')?.default).toBe('13');
    expect(field('ticketKind')?.default).toBeUndefined();
    expect(
      field('taxAmount')?.placeholderOf?.({
        amount: '66555',
        taxRate: '13',
        taxIncluded: true,
      }),
    ).toBe('自动计算：7656.77');
  });

  it('keeps foreign invoices requiring a real number', () => {
    const definition = financeActions(contract('FOREIGN')).CREATE_INVOICE!;
    expect(
      definition.fields.find((item) => item.key === 'invoiceNumber')?.required,
    ).toBe(true);
    expect(definition.fields.some((item) => item.key === 'content')).toBe(
      false,
    );
  });

  it('computes tax inclusive and exclusive like the server', () => {
    expect(invoiceTaxAmount('100', '13', false)).toBe('13.00');
    expect(invoiceTaxAmount('113', '13', true)).toBe('13.00');
    expect(invoiceTaxAmount('', '13', true)).toBeUndefined();
  });

  it('only offers invoices still missing a number or evidence for supplement', () => {
    const value = contract('DOMESTIC');
    value.finance!.invoices = [
      { id: 'a', status: 'VALID', amount: '1', content: '待补' },
      {
        id: 'b',
        status: 'VALID',
        amount: '1',
        invoiceNumber: 'N',
        evidenceRef: 'f',
      },
      { id: 'c', status: 'VOID', amount: '1' },
    ] as never;
    expect(
      financeActions(value)
        .SUPPLEMENT_INVOICE!.fields.find((item) => item.key === 'invoiceId')
        ?.options?.map((option) => option.value),
    ).toEqual(['a']);
  });
});
