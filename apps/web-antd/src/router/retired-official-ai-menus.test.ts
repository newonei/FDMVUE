import type { AppRouteRecordRaw } from '@vben/types';

import { describe, expect, it } from 'vitest';

import { filterRetiredOfficialAiMenus } from './retired-official-ai-menus';

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

describe('filterRetiredOfficialAiMenus', () => {
  it('removes the retired /ai root and its complete subtree', () => {
    const menus = [
      createMenu('OfficialAi', '/ai', {
        children: [
          createMenu('OfficialAiChat', 'chat', {
            component: 'ai/chat/index/index.vue',
          }),
        ],
      }),
      createMenu('Dashboard', '/dashboard'),
    ];

    expect(filterRetiredOfficialAiMenus(menus)).toEqual([menus[1]]);
  });

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

    const filtered = filterRetiredOfficialAiMenus(menus);

    expect(filtered[0]?.children?.map((menu) => menu.name)).toEqual([
      'CurrentTool',
    ]);
    expect(menus[0]?.children).toHaveLength(2);
  });

  it('preserves the replacement /fdmai tree and similar non-retired paths', () => {
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
    ];

    expect(filterRetiredOfficialAiMenus(menus)).toEqual(menus);
  });
});
