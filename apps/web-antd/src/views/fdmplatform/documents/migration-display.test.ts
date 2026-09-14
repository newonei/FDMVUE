import { describe, expect, it } from 'vitest';

import {
  contractReferenceText,
  migrationCell,
  nativeMoney,
} from './migration-display';
describe('imported financial amounts remain explicit', () => {
  it('uses known contract names and never emits an empty linked caption for missing or whitespace-only labels', () => {
    expect(contractReferenceText('', '真实合同标题', 'contract-1')).toBe(
      '真实合同标题',
    );
    expect(contractReferenceText(' ', '', 'contract-1')).toBe('查看关联合同');
    expect(contractReferenceText(undefined, null, null)).toBe('尚未关联合同');
  });
  it('preserves source book amount when original currency amount is absent', () => {
    const row = {
      amount: null,
      currency: null,
      sourceBookAmount: '3637.31',
      sourceBookCurrency: null,
    };
    expect(migrationCell(row, 'amount')).toBe('原币金额未导出');
    expect(migrationCell(row, 'currency')).toBe('币种待核对');
    expect(migrationCell(row, 'sourceBookAmount')).toBe(
      '3,637.31（币种待核对）',
    );
  });
  it('keeps zero distinct from missing and does not assume RMB', () => {
    expect(nativeMoney('0', null)).toBe('0.00（币种待核对）');
    expect(nativeMoney(null, null)).toBe('未提供（币种待核对）');
    expect(nativeMoney('10', 'USD')).toBe('USD 10.00');
    expect(
      migrationCell({ amount: '10', currency: 'USD' }, 'amount'),
    ).toBeUndefined();
  });
});
