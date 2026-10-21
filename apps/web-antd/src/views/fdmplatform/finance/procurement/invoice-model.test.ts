import { describe, expect, it } from 'vitest';

import {
  allocateInvoice,
  allocationInputs,
  allocationProblem,
  invoicePaymentLimit,
} from './invoice-model';

const orders = [
  {
    key: 'a',
    contractId: 'c1',
    orderId: 'a',
    code: 'CG001',
    remaining: '3000',
  },
  { key: 'b', contractId: '', orderId: 'b', code: 'CG002', remaining: '8000' },
  {
    key: 'c',
    contractId: 'c3',
    orderId: 'c',
    code: 'CG003',
    remaining: '4500',
  },
];

describe('集中收票分配', () => {
  it('按未开票依次填满，最后一张可以部分开票', () => {
    expect(allocateInvoice('15500', orders)).toEqual({
      a: '3000.00',
      b: '8000.00',
      c: '4500.00',
    });
    expect(allocateInvoice('9000', orders)).toEqual({
      a: '3000.00',
      b: '6000.00',
      c: undefined,
    });
  });
  it('关联合计须等于发票金额，单张单不能超开', () => {
    const full = allocateInvoice('15500', orders);
    expect(allocationProblem('15500', full, orders)).toBe('');
    expect(allocationProblem('16000', full, orders)).toContain(
      '须等于发票金额',
    );
    expect(
      allocationProblem('15600', { ...full, a: '3100' }, orders),
    ).toContain('CG001 超额开票');
    expect(allocationProblem('0', full, orders)).toContain('大于 0');
    expect(allocationProblem('1', {}, orders)).toContain('至少一张');
  });
  it('金额为 0 的单不关联', () => {
    expect(
      allocationInputs({ a: '3000', b: '0', c: undefined }, orders),
    ).toEqual([
      { contractId: 'c1', orderId: 'a', orderCode: 'CG001', amount: '3000.00' },
    ]);
  });
  it('付款上限是剩余未付', () => {
    expect(invoicePaymentLimit('10000')?.toFixed(0)).toBe('10000');
    expect(invoicePaymentLimit(undefined)).toBeUndefined();
  });
});
