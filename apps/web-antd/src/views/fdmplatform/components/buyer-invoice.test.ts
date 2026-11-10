import type { Contract, Directory } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { financeActions, invoiceTaxAmount } from '../data';
import { withDirectory } from '../directory';
import { invoiceBuyerText, invoiceIssuer } from '../documents/model';
import { buyerInfoText } from '../trade/customers/model';

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

describe('invoice records carry the issuer and buyer details', () => {
  const keys = (type: string) =>
    financeActions(contract(type)).CREATE_INVOICE?.fields ?? [];

  it('defaults the issuing company to the contract company on both channels', () => {
    for (const type of ['DOMESTIC', 'FOREIGN']) {
      const value = contract(type);
      value.companyId = 12;
      const issuer = financeActions(value).CREATE_INVOICE?.fields.find(
        (item) => item.key === 'issuerCompanyId',
      );
      expect(issuer?.required).toBe(true);
      expect(issuer?.default).toBe(12);
    }
  });

  it('requires buyer details on domestic invoices only', () => {
    const required = (type: string) =>
      keys(type).find((item) => item.key === 'buyerInfo')?.required;
    expect(required('DOMESTIC')).toBe(true);
    expect(required('FOREIGN')).toBe(false);
  });

  it('lists companies from the directory as issuer options', () => {
    const issuer = withDirectory(
      financeActions(contract('FOREIGN')).CREATE_INVOICE!,
      {
        companies: [{ companyId: 5, companyName: '武汉顶铭' }],
        departments: [],
        users: [],
      } as unknown as Directory,
    ).fields.find((item) => item.key === 'issuerCompanyId');
    expect(issuer?.options).toEqual([{ value: 5, label: '武汉顶铭' }]);
  });

  it('formats the customer archive the way Jinzhi wrote buyer details', () => {
    expect(
      buyerInfoText(
        {
          taxNo: '9133',
          address: '杭州',
          phone: '137',
          bankName: '工行',
          bankAccount: '1202',
        },
        '杭州同尘',
      ),
    ).toBe(
      '名称:杭州同尘\n纳税人识别号:9133\n地址电话:杭州 137\n开户行及账号:工行 1202',
    );
    expect(buyerInfoText(undefined, '杭州同尘')).toBe('');
  });

  it('shows the source text for imported records and the snapshot for older ones', () => {
    expect(invoiceIssuer({ migration: { sourceCompanyName: '飞德慕' } })).toBe(
      '飞德慕',
    );
    expect(invoiceIssuer({ issuerName: '武汉顶铭', migration: null })).toBe(
      '武汉顶铭',
    );
    expect(
      invoiceBuyerText({ buyerInfo: '见附件', buyer: { title: 'A' } }),
    ).toBe('见附件');
    expect(invoiceBuyerText({ buyer: { title: 'A', taxNo: 'B' } })).toBe(
      '名称：A\n税号：B',
    );
    expect(invoiceBuyerText({})).toBeUndefined();
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
