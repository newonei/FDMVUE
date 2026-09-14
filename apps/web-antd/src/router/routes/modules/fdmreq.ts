import type { RouteRecordRaw } from 'vue-router';

/**
 * REQ-20260914-01: register list / detail / pending so pages are reachable.
 * hideInMenu avoids duplicating backend system_menu entries.
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/fdmreq',
    name: 'FdmReq',
    redirect: '/fdmreq/requirements',
    meta: {
      title: '需求中心',
      icon: 'lucide:clipboard-list',
      hideInMenu: true,
      order: 90,
    },
    children: [
      {
        path: 'requirements',
        name: 'FdmReqRequirement',
        meta: { title: '需求台账', icon: 'lucide:list' },
        component: () => import('#/views/fdmreq/requirement/index.vue'),
      },
      {
        path: 'requirements/detail',
        name: 'FdmReqRequirementDetail',
        meta: {
          title: '需求详情',
          hideInMenu: true,
          activePath: '/fdmreq/requirements',
        },
        component: () => import('#/views/fdmreq/requirement/detail.vue'),
      },
      {
        path: 'pending',
        name: 'FdmReqPending',
        meta: { title: '我的待办', icon: 'lucide:inbox' },
        component: () => import('#/views/fdmreq/pending/index.vue'),
      },
    ],
  },
];

export default routes;