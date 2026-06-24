import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/fdmtool/my-client',
    alias: ['/fdmxui/my-client'],
    component: () => import('#/views/fdmxui/my-client/index.vue'),
    name: 'FdmToolMyClient',
    meta: {
      title: '我的3XUI订阅',
      icon: 'lucide:badge-check',
      order: 0,
    },
  },
];

export default routes;
