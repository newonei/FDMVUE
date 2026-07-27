import type { RouteRecordRaw } from 'vue-router';

import { IFrameView } from '#/layouts';

function resolveInfiniteCanvasUrl() {
  const configuredUrl = import.meta.env.VITE_INFINITE_CANVAS_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  const fallbackUrl = new URL(window.location.origin);
  fallbackUrl.port = '3001';
  fallbackUrl.pathname = '/';
  fallbackUrl.search = '';
  fallbackUrl.hash = '';
  return fallbackUrl.toString();
}

const routes: RouteRecordRaw[] = [
  {
    component: IFrameView,
    meta: {
      icon: 'lucide:panels-top-left',
      iframeSrc: resolveInfiniteCanvasUrl(),
      keepAlive: true,
      order: 1,
      title: '无限画布',
    },
    name: 'InfiniteCanvas',
    path: '/infinite-canvas',
  },
];

export default routes;
