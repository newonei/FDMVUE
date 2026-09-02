import { describe, expect, it } from 'vitest';

import { add, equals, money, multiply, quantity, subtract } from './money';

describe('foreign-trade decimal helpers', () => {
  it('does not leak JavaScript floating point errors', () => {
    expect(add('0.1', '0.2')).toBe('0.3');
    expect(multiply('600.00', '7.18')).toBe('4308');
    expect(money(multiply('600.00', '7.18'))).toBe('4308.00');
  });

  it('keeps money and precision quantities as decimal strings', () => {
    expect(money('2.845')).toBe('2.85');
    expect(quantity('5100.000000')).toBe('5100');
    expect(subtract('1000', '600', '100', '20')).toBe('280');
    expect(equals(add('600', '100', '20'), '720')).toBe(true);
  });
});
