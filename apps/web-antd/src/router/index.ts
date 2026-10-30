import {
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';

import { resetStaticRoutes } from '@vben/utils';

import { installMergedRouteRedirects } from '#/views/fdmplatform/documents/merged-routes';
import { installPlatformTabPolicy } from '#/views/fdmplatform/documents/tab-policy';

import { createRouterGuard } from './guard';
import { routes } from './routes';
import { setupBaiduTongJi } from './tongji';

/**
 *  @zh_CN 创建vue-router实例
 */
const router = createRouter({
  history:
    import.meta.env.VITE_ROUTER_HISTORY === 'hash'
      ? createWebHashHistory(import.meta.env.VITE_BASE)
      : createWebHistory(import.meta.env.VITE_BASE),
  // 应该添加到路由的初始路由列表。
  routes,
  scrollBehavior: (to, _from, savedPosition) => {
    if (savedPosition) {
      return savedPosition;
    }
    return to.hash ? { behavior: 'smooth', el: to.hash } : { left: 0, top: 0 };
  },
  // 是否应该禁止尾部斜杠。
  // strict: true,
});

const resetRoutes = () => resetStaticRoutes(router, routes);

// 创建路由守卫
createRouterGuard(router);
// 业务协同平台页面按菜单复用标签，详情与筛选参数不再另开标签
installPlatformTabPolicy(router);
// 业务协同平台合并后的旧菜单地址跳转到部门页面的对应页签
installMergedRouteRedirects(router);
// 设置百度统计
setupBaiduTongJi(router);

export { resetRoutes, router };
