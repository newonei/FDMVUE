import type {
  AppRouteRecordRaw,
  ComponentRecordType,
  GenerateMenuAndRoutesOptions,
} from '@vben/types';

import { generateAccessible } from '@vben/access';
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';
import { convertServerMenuToRouteRecordStringComponent } from '@vben/utils';

import { BasicLayout, IFrameView } from '#/layouts';

import { filterDisabledOfficialBusinessMenus } from './disabled-official-business-menus';
import { applyFdmDocumentRouteMeta } from './fdm-document-route-meta';
import { selectBackendMixedStaticRoutes } from './fdm-trade-prototype-routing';
import { applyFdmFactorySupplyTaskRouteMeta } from './fdmfactory-supply-task-route-meta';
import { hideLegacyBatchQuotationMenu } from './legacy-batch-quotation-menu';

const forbiddenComponent = () => import('#/views/_core/fallback/forbidden.vue');

async function generateAccess(options: GenerateMenuAndRoutesOptions) {
  const pageMap: ComponentRecordType = import.meta.glob([
    '../views/**/*.vue',
    '!../views/ai/**/*.vue',
    '!../views/erp/**/*.vue',
    '!../views/mes/**/*.vue',
    '!../views/wms/**/*.vue',
  ]);
  const accessStore = useAccessStore();

  const layoutMap: ComponentRecordType = {
    BasicLayout,
    IFrameView,
  };

  // The application normally uses backend menus. Dashboard/Profile and the
  // remaining trade prototypes are still frontend-owned. The production
  // /fdmwaimao route comes exclusively from the backend menu tree.
  const configuredAccessMode = preferences.app.accessMode;
  const accessMode =
    configuredAccessMode === 'backend' ? 'mixed' : configuredAccessMode;
  const routes =
    configuredAccessMode === 'backend'
      ? selectBackendMixedStaticRoutes(options.routes)
      : options.routes;

  return await generateAccessible(accessMode, {
    ...options,
    routes,
    fetchMenuListAsync: async () => {
      // 菜单从 accessStore 读取，这里不再进行 message.loading 提示
      // 补充说明：accessStore.accessMenus 一开始是 AppRouteRecordRaw 类型（后端加载），后面被赋值成 MenuRecordRaw 类型（前端转换）
      const accessMenus = accessStore.accessMenus as AppRouteRecordRaw[];
      return applyFdmDocumentRouteMeta(
        applyFdmFactorySupplyTaskRouteMeta(
          convertServerMenuToRouteRecordStringComponent(
            hideLegacyBatchQuotationMenu(
              filterDisabledOfficialBusinessMenus(accessMenus),
            ),
          ),
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
