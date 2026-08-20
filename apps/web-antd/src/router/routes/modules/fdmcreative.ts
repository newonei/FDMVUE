import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: String.raw`/fdmcreative/drama/:projectId(\d+)`,
    name: 'FdmCreativeDramaDetail',
    component: () => import('#/views/fdmcreative/drama/detail.vue'),
    meta: {
      activePath: '/fdmcreative/drama',
      hideInMenu: true,
      hideInTab: true,
      keepAlive: false,
      noBasicLayout: true,
      title: '短剧生产',
    },
  },
  {
    path: String.raw`/fdmcreative/workbench/:projectId(\d+)`,
    name: 'FdmCreativeWorkbenchEditor',
    component: () => import('#/views/fdmcreative/workbench/editor/index.vue'),
    meta: {
      activePath: '/fdmcreative/workbench',
      hideInMenu: true,
      hideInTab: true,
      keepAlive: false,
      noBasicLayout: true,
      title: '图像视频工作台',
    },
  },
];

export default routes;
