import type { RouteRecordRaw } from 'vue-router';

import { mergeRouteModules, traverseTreeValues } from '@vben/utils';

import { coreRoutes, fallbackNotFoundRoute } from './core';

// 路由模块与 Vitest 测试可以同为 TypeScript 文件；显式排除测试，避免把
// `describe()` 等测试运行时代码打进正常的 Vite 应用。
const dynamicRouteFiles = import.meta.glob(
  [
    './modules/**/*.ts',
    '!./modules/**/*.spec.ts',
    '!./modules/**/*.test.ts',
    // Keep official sources available for upstream merges, but never register
    // the disabled AI/MES business modules in this FDM runtime.
    '!./modules/ai.ts',
    '!./modules/mes.ts',
    // 外贸部门已由数据库菜单提供真实路由；保留原型源码，但不再注入运行时。
    '!./modules/fdmwaimao-prototype.ts',
  ],
  {
    eager: true,
  },
);

// 有需要可以自行打开注释，并创建文件夹
// const externalRouteFiles = import.meta.glob('./external/**/*.ts', { eager: true });
// const staticRouteFiles = import.meta.glob('./static/**/*.ts', { eager: true });

/** 动态路由 */
const dynamicRoutes: RouteRecordRaw[] = mergeRouteModules(dynamicRouteFiles);

/** 外部路由列表，访问这些页面可以不需要Layout，可能用于内嵌在别的系统(不会显示在菜单中) */
// const externalRoutes: RouteRecordRaw[] = mergeRouteModules(externalRouteFiles);
// const staticRoutes: RouteRecordRaw[] = mergeRouteModules(staticRouteFiles);
const staticRoutes: RouteRecordRaw[] = [];
const externalRoutes: RouteRecordRaw[] = [];

/** 路由列表，由基本路由、外部路由和404兜底路由组成
 *  无需走权限验证（会一直显示在菜单中） */
const routes: RouteRecordRaw[] = [
  ...coreRoutes,
  ...externalRoutes,
  fallbackNotFoundRoute,
];

/** 基本路由列表，这些路由不需要进入权限拦截 */
const coreRouteNames = traverseTreeValues(coreRoutes, (route) => route.name);

/** 有权限校验的路由列表，包含动态路由和静态路由 */
const accessRoutes = [...dynamicRoutes, ...staticRoutes];

// add by 芋艿：from https://github.com/vbenjs/vue-vben-admin/blob/main/playground/src/router/routes/index.ts#L38-L45
const componentKeys: string[] = Object.keys(
  import.meta.glob([
    '../../views/**/*.vue',
    '!../../views/ai/**/*.vue',
    '!../../views/erp/**/*.vue',
    '!../../views/mes/**/*.vue',
    '!../../views/wms/**/*.vue',
  ]),
)
  .filter((item) => !item.includes('/modules/'))
  .map((v) => {
    const path = v.replace('../../views/', '/');
    return path.endsWith('.vue') ? path.slice(0, -4) : path;
  });
export { accessRoutes, componentKeys, coreRouteNames, routes };
