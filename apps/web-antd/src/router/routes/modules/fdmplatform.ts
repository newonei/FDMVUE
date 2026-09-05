import type { RouteRecordRaw } from 'vue-router';

// The platform is an opt-in extension. The standard system keeps its current menu.
const routes: RouteRecordRaw[] =
  import.meta.env.VITE_FDM_PLATFORM_ENABLED === 'true'
    ? [
        {
          path: '/fdmplatform/workbench',
          name: 'FdmPlatformWorkbench',
          component: () => import('#/views/fdmplatform/index.vue'),
          meta: {
            icon: 'lucide:workflow',
            keepAlive: false,
            order: 21,
            title: '业务协同平台',
          },
        },
      ]
    : [];

export default routes;
