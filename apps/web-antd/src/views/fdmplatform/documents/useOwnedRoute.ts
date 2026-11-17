import { shallowReactive, watch } from 'vue';
import { useRoute } from 'vue-router';

/** 菜单缓存期间保留本页的地址上下文，避免其他菜单的 query 改动隐藏页。 */
export function useOwnedRoute() {
  const route = useRoute();
  const ownerPath = route.path;
  const ownedRoute = shallowReactive({ ...route });
  let previousPath = ownerPath;
  watch(
    () => [route.path, route.query, route.hash],
    () => {
      if (route.path === ownerPath) {
        // 侧边菜单通常只有 path，返回时继续上次页签和筛选；本页清除 query 仍正常生效。
        const returningToMenu =
          previousPath !== ownerPath && Object.keys(route.query).length === 0;
        Object.assign(
          ownedRoute,
          route,
          returningToMenu ? { query: ownedRoute.query } : {},
        );
      }
      previousPath = route.path;
    },
    { flush: 'sync' },
  );
  return ownedRoute;
}
