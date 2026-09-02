import type { RouteRecordStringComponent } from '@vben/types';

const DETAIL_COMPONENT_NAME = 'MesFactorySupplyTaskDetail';

/**
 * system_menu has no active_path column. Keep the detail route backend-owned,
 * but enrich its runtime meta after conversion so the hidden detail page keeps
 * the owning list menu highlighted without registering a duplicate static route.
 */
export function applyFactorySupplyTaskRouteMeta(
  routes: RouteRecordStringComponent[],
): RouteRecordStringComponent[] {
  return routes.map<RouteRecordStringComponent>((route) => {
    const children = route.children
      ? applyFactorySupplyTaskRouteMeta(route.children)
      : route.children;
    const next = { ...route, children } as RouteRecordStringComponent;
    if (String(route.name || '') !== DETAIL_COMPONENT_NAME) {
      return next;
    }
    if (next.meta) {
      next.meta = Object.assign({}, next.meta);
      next.meta.activePath = '/mes/factory-supply-task';
      next.meta.hideInMenu = true;
    }
    return next;
  });
}
