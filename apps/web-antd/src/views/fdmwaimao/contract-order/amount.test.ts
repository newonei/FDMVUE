import { describe, expect, it } from 'vitest';

import {
  calculateContractAmount,
  calculateLineAmount,
  canonicalDecimal,
  formatCurrencyAmount,
} from './amount';

describe('contract order amount calculation', () => {
  it('rounds each line HALF_UP to two decimal places', () => {
    expect(
      calculateLineAmount({
        discountRate: '100',
        quantity: '1',
        unitPrice: '0.105',
      }),
    ).toBe('0.11');
  });

  it('matches the server formula without JavaScript floating point loss', () => {
    const result = calculateContractAmount({
      additionalFeeAmount: '2.33',
      items: [
        { discountRate: '90', quantity: '3', unitPrice: '10' },
        { discountRate: '100', quantity: '2', unitPrice: '0.105' },
      ],
      orderDiscountRate: '95',
      roundingDiscountAmount: '0.01',
    });

    expect(result.itemAmounts).toEqual(['27.00', '0.21']);
    expect(result.productAmount).toBe('27.21');
    expect(result.discountedProductAmount).toBe('25.85');
    expect(result.orderDiscountAmount).toBe('1.36');
    expect(result.totalAmount).toBe('28.17');
  });

  it('allows a zero-price free item and preserves decimal strings', () => {
    const result = calculateContractAmount({
      additionalFeeAmount: '0',
      items: [{ discountRate: '100', quantity: '2.5', unitPrice: '0' }],
      orderDiscountRate: '100',
      roundingDiscountAmount: '0',
    });

    expect(result.itemAmounts).toEqual(['0.00']);
    expect(result.totalAmount).toBe('0.00');
    expect(canonicalDecimal('00012.3400')).toBe('12.34');
  });

  it('formats amounts for display without converting through number', () => {
    expect(formatCurrencyAmount('123456789012345678.9')).toBe(
      '123,456,789,012,345,678.90',
    );
  });
});
