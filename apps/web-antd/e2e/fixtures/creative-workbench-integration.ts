import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';

import { registerAccessDirective } from '@vben/access';
import { useAccessStore } from '@vben/stores';
import { unmountGlobalLoading } from '@vben/utils';
import '@vben/styles';
import '@vben/styles/antd';

import Fixture from './FdmCreativeWorkbenchIntegrationFixture.vue';

const app = createApp(RouterView);
const pinia = createPinia();
app.use(pinia);
const runner = new URLSearchParams(location.search).get('runner') === 'true';
useAccessStore(pinia).setAccessCodes(
  runner
    ? [
        'fdmcreative:execution:run',
        'fdmcreative:execution:retry',
        'fdmcreative:execution:cancel',
      ]
    : [
        'fdmcreative:project:query',
        'fdmcreative:workflow:query',
        'fdmcreative:workflow:update',
        'fdmcreative:workflow:publish',
        'fdmcreative:execution:query',
        'fdmcreative:execution:run',
        'fdmcreative:execution:retry',
        'fdmcreative:execution:cancel',
        'fdmcreative:asset:query',
        'fdmcreative:asset:create',
        'fdmcreative:plan:generate',
        'fdmcreative:node-result:query',
        'fdmcreative:node-result:adopt',
      ],
);
registerAccessDirective(app);
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/fdmcreative/workbench/:projectId', component: Fixture },
    { path: '/:pathMatch(.*)*', redirect: '/fdmcreative/workbench/33' },
  ],
});
app.use(router);
app.config.errorHandler = (error) => {
  document.body.dataset.fixtureError = String(error);
  console.error(error);
};
await router.push('/fdmcreative/workbench/33');
await router.isReady();
app.mount('#app');
unmountGlobalLoading();
