import type { AppRouteRecordRaw } from '@vben/types';

import { describe, expect, it } from 'vitest';

import { hideLegacyBatchQuotationMenu } from './legacy-batch-quotation-menu';

function createMenu(
  name: string,
  path: string,
  options: Partial<AppRouteRecordRaw> = {},
): AppRouteRecordRaw {
  return {
    meta: {},
    name,
    path,
    visible: true,
    ...options,
  } as AppRouteRecordRaw;
}

describe('hideLegacyBatchQuotationMenu', () => {
  it('hides the legacy page identified by component without mutating input', () => {
    const menu = createMenu('BatchQuotation', '/legacy-batch', {
      component: 'fdmcaiwu/batch-quotation/index',
    });

    const result = hideLegacyBatchQuotationMenu([menu]);

    expect(result[0]?.visible).toBe(false);
    expect(result[0]).not.toBe(menu);
    expect(menu.visible).toBe(true);
  });

  it('hides the legacy page identified by component name', () => {
    const menus = [
      createMenu('BatchQuotation', '/legacy-batch', {
        componentName: 'FdmcaiwuBatchQuotation',
      }),
    ];

    expect(hideLegacyBatchQuotationMenu(menus)[0]?.visible).toBe(false);
  });

  it('hides a batch-quotation child under /caiwu by its resolved path', () => {
    const menus = [
      createMenu('Caiwu', '/caiwu', {
        children: [createMenu('BatchQuotation', 'batch-quotation')],
      }),
    ];

    const result = hideLegacyBatchQuotationMenu(menus);

    expect(result[0]?.visible).toBe(true);
    expect(result[0]?.children?.[0]?.visible).toBe(false);
  });

  it('preserves similarly named routes outside the caiwu tree', () => {
    const menus = [
      createMenu('OtherBatchQuotation', '/tools', {
        children: [createMenu('BatchQuotation', 'batch-quotation')],
      }),
      createMenu('Quotation', '/caiwu/quotation', {
        component: 'fdmcaiwu/quotation/index',
        componentName: 'FdmcaiwuQuotation',
      }),
    ];

    const result = hideLegacyBatchQuotationMenu(menus);

    expect(result).toEqual(menus);
  });
});
