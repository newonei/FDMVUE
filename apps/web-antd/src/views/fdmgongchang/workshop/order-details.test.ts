import { describe, expect, it } from 'vitest';

import { orderProductSpec } from './order-details';

const item = { orderId: 1, orderNo: 'GC-1', itemId: 2 };

describe('workshop order product snapshot summary', () => {
  it('shows a repeated complete size once without rewriting the source snapshot', () => {
    const source = { ...item, specification: 'TPE 183×61×0.6cm', size: '183×61×0.6cm' };
    expect(orderProductSpec(source)).toBe('TPE 1830×610×6 mm');
    expect(source.size).toBe('183×61×0.6cm');
  });

  it('keeps an explicit PE material when the specification says TPE', () => {
    expect(orderProductSpec({ ...item, specification: 'TPE 183×61×0.6cm', material: 'PE' }))
      .toBe('TPE 1830×610×6 mm · PE');
  });

  it('keeps a conflicting 83 cm size when the specification says 183 cm', () => {
    expect(orderProductSpec({ ...item, specification: '183×61×0.6cm', size: '83×61×0.6cm' }))
      .toBe('1830×610×6 mm · 830×610×6 mm');
  });
});
