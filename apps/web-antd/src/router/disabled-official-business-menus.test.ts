import type { AppRouteRecordRaw } from '@vben/types';

import { describe, expect, it } from 'vitest';

import { filterDisabledOfficialBusinessMenus } from './disabled-official-business-menus';

function createMenu(
  name: string,
  path: string,
  options: Partial<AppRouteRecordRaw> = {},
): AppRouteRecordRaw {
  return {
    meta: {},
    name,
    path,
    ...options,
  } as AppRouteRecordRaw;
}

describe('filterDisabledOfficialBusinessMenus', () => {
  it.each(['/ai', '/erp', '/mes', '/wms'])(
    'removes disabled root %s and its complete subtree',
    (rootPath) => {
      const menus = [
        createMenu('OfficialBusiness', rootPath, {
          children: [
            createMenu('OfficialChild', 'child', { component: 'tools/child' }),
          ],
        }),
        createMenu('Dashboard', '/dashboard'),
      ];

      expect(filterDisabledOfficialBusinessMenus(menus)).toEqual([menus[1]]);
    },
  );

  it('recursively removes orphaned ai components while preserving siblings', () => {
    const menus = [
      createMenu('Tools', '/tools', {
        children: [
          createMenu('OfficialAiModel', 'legacy-model', {
            component: 'ai/model/model/index.vue',
          }),
          createMenu('CurrentTool', 'current-tool', {
            component: 'tools/current/index',
          }),
        ],
      }),
    ];

    const filtered = filterDisabledOfficialBusinessMenus(menus);

    expect(filtered[0]?.children?.map((menu) => menu.name)).toEqual([
      'CurrentTool',
    ]);
    expect(menus[0]?.children).toHaveLength(2);
  });

  it('preserves every FDM-owned tree and similar non-disabled paths', () => {
    const menus = [
      createMenu('FdmAi', '/fdmai', {
        children: [
          createMenu('FdmAiModels', 'models', {
            component: 'fdmai/models/index',
          }),
        ],
      }),
      createMenu('AiTools', '/ai-tools', {
        component: 'tools/ai/index',
      }),
      createMenu('FdmWarehouse', '/fdmwarehouse', {
        component: 'fdmwarehouse/outbound-order/index',
      }),
      createMenu('FdmFactory', '/fdmfactory', {
        component: 'fdmfactory/supply-task/index',
      }),
      createMenu('FdmProcurement', '/fdmprocurement', {
        component: 'fdmprocurement/purchase-execution/receipt/index',
      }),
    ];

    expect(filterDisabledOfficialBusinessMenus(menus)).toEqual(menus);
  });
});
