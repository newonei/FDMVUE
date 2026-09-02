import type { RouteRecordRaw } from 'vue-router';

import { resolveLegacyFdmWaimaoCrmPath } from '../../fdm-trade-prototype-routing';

const routes: RouteRecordRaw[] = [
  {
    path: '/fdmwaimaocrm-prototype',
    name: 'LegacyFdmWaimaoCrmPrototypeRedirect',
    redirect: (to) => resolveLegacyFdmWaimaoCrmPath(to.query.view),
    meta: {
      title: '外贸 CRM 原型兼容跳转',
      hideInBreadcrumb: true,
      hideInMenu: true,
      hideInTab: true,
    },
  },
];

export default routes;
