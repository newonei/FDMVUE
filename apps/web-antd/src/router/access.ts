import type {
  AppRouteRecordRaw,
  ComponentRecordType,
  GenerateMenuAndRoutesOptions,
} from '@vben/types';

import { generateAccessible } from '@vben/access';
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';
import {
  convertServerMenuToRouteRecordStringComponent,
  filterTree,
} from '@vben/utils';

import { BasicLayout, IFrameView } from '#/layouts';

import { filterDisabledOfficialBusinessMenus } from './disabled-official-business-menus';
import { hideLegacyBatchQuotationMenu } from './legacy-batch-quotation-menu';

const forbiddenComponent = () => import('#/views/_core/fallback/forbidden.vue');

async function generateAccess(options: GenerateMenuAndRoutesOptions) {
  const pageMap: ComponentRecordType = import.meta.glob([
    '../views/**/*.vue',
    '!../views/ai/**/*.vue',
    '!../views/crm/**/*.vue',
    '!../views/erp/**/*.vue',
    '!../views/mes/**/*.vue',
    '!../views/wms/**/*.vue',
  ]);
  const accessStore = useAccessStore();

  const layoutMap: ComponentRecordType = {
    BasicLayout,
    IFrameView,
  };

  // 后端菜单模式下前端静态路由不按角色过滤；meta.authority 写了角色的（如公司看板只给超级管理员）在这里过滤
  const roles = options.roles ?? [];
  const routes = filterTree(
    options.routes,
    (route) =>
      !route.meta?.authority ||
      route.meta.authority.some((role) => roles.includes(role)),
  );

  return await generateAccessible(preferences.app.accessMode, {
    ...options,
    routes,
    fetchMenuListAsync: async () => {
      // 菜单从 accessStore 读取，这里不再进行 message.loading 提示
      // 补充说明：accessStore.accessMenus 一开始是 AppRouteRecordRaw 类型（后端加载），后面被赋值成 MenuRecordRaw 类型（前端转换）
      const accessMenus = accessStore.accessMenus as AppRouteRecordRaw[];
      return convertServerMenuToRouteRecordStringComponent(
        hideLegacyBatchQuotationMenu(
          filterDisabledOfficialBusinessMenus(accessMenus),
        ),
      );
    },
    // 可以指定没有权限跳转403页面
    forbiddenComponent,
    // 如果 route.meta.menuVisibleWithForbidden = true
    layoutMap,
    pageMap,
  });
}

export { generateAccess };
